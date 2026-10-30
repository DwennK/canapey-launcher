use super::*;
use std::{io::Write, path::Path};
use windows_sys::Win32::{
    Foundation::{LocalFree, HWND, LPARAM, LRESULT, WPARAM},
    Security::Cryptography::*,
    System::Power::*,
    UI::{
        Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass},
        WindowsAndMessaging::{
            DEVICE_NOTIFY_CALLBACK, ENDSESSION_CLOSEAPP, ENDSESSION_LOGOFF, PBT_APMRESUMEAUTOMATIC,
            PBT_APMSUSPEND, WM_ENDSESSION, WM_NCDESTROY,
        },
    },
};
fn protect(bytes: &[u8], encrypt: bool) -> tv::Result<Vec<u8>> {
    if bytes.len() > 65_536 {
        return Err("The saved TV pairing is too large.".into());
    }
    unsafe {
        let input = CRYPT_INTEGER_BLOB {
            cbData: bytes.len() as u32,
            pbData: bytes.as_ptr().cast_mut(),
        };
        let mut output: CRYPT_INTEGER_BLOB = std::mem::zeroed();
        let ok = if encrypt {
            CryptProtectData(
                &input,
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        } else {
            CryptUnprotectData(
                &input,
                std::ptr::null_mut(),
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        };
        if ok == 0 {
            return Err("Windows could not protect or read the TV pairing. Pair it again on this Windows account.".into());
        }
        let result = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        if !encrypt {
            use zeroize::Zeroize;
            std::slice::from_raw_parts_mut(output.pbData, output.cbData as usize).zeroize();
        }
        LocalFree(output.pbData.cast());
        Ok(result)
    }
}
pub fn load(path: &Path) -> tv::Result<Option<PairedTv>> {
    if !path.exists() {
        return Ok(None);
    }
    if std::fs::metadata(path)
        .map_err(|_| "Could not read the saved TV pairing.")?
        .len()
        > 65_536
    {
        return Err("The saved TV pairing is too large.".into());
    }
    let bytes = std::fs::read(path).map_err(|_| "Could not read the saved TV pairing.")?;
    let plain = zeroize::Zeroizing::new(protect(&bytes, false)?);
    let value: PairedTv = serde_json::from_slice(&plain)
        .map_err(|_| "The saved TV pairing is invalid. Pair the TV again.")?;
    value.validate()?;
    Ok(Some(value))
}
pub fn save(path: &Path, paired: &PairedTv) -> tv::Result<()> {
    paired.validate()?;
    let plain = zeroize::Zeroizing::new(
        serde_json::to_vec(paired).map_err(|_| "Could not save the TV pairing.")?,
    );
    let encrypted = protect(&plain, true)?;
    let mut file =
        tempfile::NamedTempFile::new_in(path.parent().ok_or("TV data folder unavailable.")?)
            .map_err(|_| "Could not save the TV pairing.")?;
    file.write_all(&encrypted)
        .and_then(|_| file.as_file().sync_all())
        .map_err(|_| "Could not save the TV pairing.")?;
    file.persist(path)
        .map_err(|_| "Could not save the TV pairing.")?;
    Ok(())
}
unsafe extern "system" fn power_event(
    context: *const core::ffi::c_void,
    kind: u32,
    _setting: *const core::ffi::c_void,
) -> u32 {
    if !context.is_null() {
        // Callback context stays alive until unregister has completed on the listener thread.
        let app = unsafe { &*context.cast::<tauri::AppHandle>() };
        if kind == PBT_APMRESUMEAUTOMATIC {
            automatic(app, true);
        } else if kind == PBT_APMSUSPEND {
            standby_before_system_event(app);
        }
    }
    0
}
pub fn start_resume_listener(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut context = Box::new(app);
        let params = DEVICE_NOTIFY_SUBSCRIBE_PARAMETERS {
            Callback: Some(power_event),
            Context: (&mut *context as *mut tauri::AppHandle).cast(),
        };
        let mut registration = std::ptr::null_mut();
        let result = unsafe {
            PowerRegisterSuspendResumeNotification(
                DEVICE_NOTIFY_CALLBACK,
                (&params as *const DEVICE_NOTIFY_SUBSCRIBE_PARAMETERS)
                    .cast_mut()
                    .cast(),
                &mut registration,
            )
        };
        if result != 0 {
            *context.state::<TvState>().error.lock().unwrap() = Some(
                "Windows could not enable TV wake after sleep. Restart Canapey and try again."
                    .into(),
            );
            emit(&context);
            return;
        }
        context
            .state::<TvState>()
            .resume_available
            .store(true, Ordering::SeqCst);
        emit(&context);
        while !context.state::<TvState>().stopped.load(Ordering::SeqCst) {
            std::thread::sleep(Duration::from_millis(250));
        }
        if unsafe { PowerUnregisterSuspendResumeNotification(registration as isize) } != 0 {
            // A callback could still run. Preserve its context until process exit.
            std::mem::forget(context);
        }
    });
}
fn standby_before_system_event(app: &tauri::AppHandle) {
    // Windows grants roughly two seconds on suspend. Never hold a callback indefinitely,
    // and cancel the async request before returning so it cannot turn off the TV on resume.
    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    let app = app.clone();
    let job = tauri::async_runtime::spawn(async move {
        before_pc_power(&app, Duration::from_millis(1400)).await;
        let _ = tx.send(());
    });
    if rx.recv_timeout(Duration::from_millis(1600)).is_err() {
        job.abort();
    }
}
fn system_is_ending(confirmed: usize, flags: isize) -> bool {
    confirmed != 0 && (flags as u32 & (ENDSESSION_CLOSEAPP | ENDSESSION_LOGOFF)) == 0
}
unsafe extern "system" fn session_event(
    hwnd: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    id: usize,
    data: usize,
) -> LRESULT {
    if message == WM_ENDSESSION && system_is_ending(wparam, lparam) {
        let app = unsafe { &*(data as *const tauri::AppHandle) };
        standby_before_system_event(app);
    } else if message == WM_ENDSESSION && wparam == 0 {
        let app = unsafe { &*(data as *const tauri::AppHandle) };
        power_cancelled(app);
    }
    if message == WM_NCDESTROY {
        unsafe {
            RemoveWindowSubclass(hwnd, Some(session_event), id);
            drop(Box::from_raw(data as *mut tauri::AppHandle));
        }
    }
    unsafe { DefSubclassProc(hwnd, message, wparam, lparam) }
}
pub fn start_shutdown_listener(app: tauri::AppHandle) {
    let handle = app.clone();
    let result = app.run_on_main_thread(move || {
        let installed = handle.get_webview_window("main").and_then(|w| w.hwnd().ok()).is_some_and(|hwnd| {
            let context = Box::into_raw(Box::new(handle.clone()));
            let ok = unsafe { SetWindowSubclass(hwnd.0.cast(), Some(session_event), 0x43415456, context as usize) } != 0;
            if !ok { unsafe { drop(Box::from_raw(context)); } }
            ok
        });
        if !installed {
            *handle.state::<TvState>().error.lock().unwrap() = Some("Windows could not enable automatic TV standby at shutdown. Restart Canapey and try again.".into());
            emit(&handle);
        }
    });
    if let Err(e) = result {
        log::warn!("TV shutdown listener: {e}");
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn standby_only_for_confirmed_system_shutdown() {
        assert!(system_is_ending(1, 0));
        assert!(!system_is_ending(0, 0));
        assert!(!system_is_ending(1, ENDSESSION_LOGOFF as isize));
        assert!(!system_is_ending(1, ENDSESSION_CLOSEAPP as isize));
    }
    #[test]
    fn dpapi_storage_survives_restart_and_rejects_corruption() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("tv.dpapi");
        let paired = PairedTv {
            tv: Television {
                name: "Test TV".into(),
                ip: "192.168.1.20".parse().unwrap(),
                mac: Some("02:11:22:33:44:55".into()),
            },
            credentials: tv::Credentials {
                username: "synthetic-user".into(),
                password: "synthetic-secret".into(),
            },
            auto_wake: true,
            auto_standby: false,
        };
        save(&path, &paired).unwrap();
        let bytes = std::fs::read(&path).unwrap();
        assert!(!String::from_utf8_lossy(&bytes).contains("synthetic-secret"));
        let loaded = load(&path).unwrap().unwrap();
        assert!(loaded.auto_wake);
        assert!(!loaded.auto_standby);
        assert_eq!(loaded.credentials.password, "synthetic-secret");
        std::fs::write(&path, b"corrupt").unwrap();
        assert!(load(&path).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"corrupt");
    }
}
