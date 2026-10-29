use crate::{
    input::{stick, ControllerSnapshot, Direction, Hold, Repeater},
    model::{deduplicate, AppEntry, Target, TargetKind},
    tracking::{Process, ProcessKey, Window},
};
use std::{
    collections::HashMap,
    ffi::OsStr,
    io::Read,
    os::windows::{ffi::OsStrExt, io::AsRawHandle, process::CommandExt},
    path::Path,
    process::{Command, Stdio},
    ptr::null,
    sync::atomic::Ordering,
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager};
use windows_sys::Win32::{
    Foundation::*,
    Graphics::Dwm::*,
    System::{
        Diagnostics::ToolHelp::*, Power::SetSuspendState, SystemInformation::*, Threading::*,
    },
    UI::{Shell::*, WindowsAndMessaging::*},
};
fn wide(s: impl AsRef<OsStr>) -> Vec<u16> {
    s.as_ref().encode_wide().chain(Some(0)).collect()
}
struct Handle(HANDLE);
impl Drop for Handle {
    fn drop(&mut self) {
        if !self.0.is_null() && self.0 != INVALID_HANDLE_VALUE {
            unsafe {
                CloseHandle(self.0);
            }
        }
    }
}
fn key_from_handle(h: HANDLE, pid: u32) -> Option<ProcessKey> {
    unsafe {
        let (mut born, mut exit, mut kernel, mut user) = (
            std::mem::zeroed(),
            std::mem::zeroed(),
            std::mem::zeroed(),
            std::mem::zeroed(),
        );
        if GetProcessTimes(h, &mut born, &mut exit, &mut kernel, &mut user) == 0 {
            return None;
        }
        Some(ProcessKey {
            pid,
            born: ((born.dwHighDateTime as u64) << 32) | born.dwLowDateTime as u64,
        })
    }
}
fn process_key(pid: u32) -> Option<ProcessKey> {
    unsafe {
        let h = Handle(OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid));
        if h.0.is_null() {
            None
        } else {
            key_from_handle(h.0, pid)
        }
    }
}
pub fn supported() -> Result<(), String> {
    #[cfg(not(target_arch = "x86_64"))]
    return Err("Windows x64 requis.".into());
    #[repr(C)]
    struct Version {
        size: u32,
        major: u32,
        minor: u32,
        build: u32,
        platform: u32,
        name: [u16; 128],
    }
    #[link(name = "ntdll")]
    unsafe extern "system" {
        fn RtlGetVersion(version: *mut Version) -> i32;
    }
    let mut v: Version = unsafe { std::mem::zeroed() };
    v.size = std::mem::size_of::<Version>() as u32;
    if unsafe { RtlGetVersion(&mut v) } != 0 || v.build < 22000 {
        return Err("Windows 11 x64 (build 22000 ou ultérieur) requis.".into());
    }
    let mut system: SYSTEM_INFO = unsafe { std::mem::zeroed() };
    unsafe {
        GetNativeSystemInfo(&mut system);
    }
    if unsafe { system.Anonymous.Anonymous.wProcessorArchitecture } != PROCESSOR_ARCHITECTURE_AMD64
    {
        return Err("Un processeur Windows x64 natif est requis.".into());
    }
    Ok(())
}
pub fn foreground_is_ours() -> bool {
    unsafe {
        let mut pid = 0;
        GetWindowThreadProcessId(GetForegroundWindow(), &mut pid);
        pid == std::process::id()
    }
}
pub fn focus(handle: isize) -> bool {
    focus_window(handle, false)
}
pub fn focus_app(window: &Window) -> bool {
    window_still_owned(window) && focus_window(window.handle, true)
}
fn can_maximize(hwnd: HWND) -> bool {
    unsafe {
        let style = GetWindowLongW(hwnd, GWL_STYLE) as u32;
        let extended = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
        let required = WS_MAXIMIZEBOX | WS_THICKFRAME | WS_SYSMENU;
        let mut class = [0u16; 256];
        let len = GetClassNameW(hwnd, class.as_mut_ptr(), class.len() as i32);
        IsWindowVisible(hwnd) != 0
            && GetWindow(hwnd, GW_OWNER).is_null()
            && style & (WS_CHILD | WS_DISABLED) == 0
            && style & required == required
            && extended & (WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE) == 0
            && len > 0
            && String::from_utf16_lossy(&class[..len as usize]) != "#32770"
    }
}
pub fn maximize(window: &Window) -> bool {
    if !window_still_owned(window) || !can_maximize(window.handle as HWND) {
        return false;
    }
    unsafe {
        let hwnd = window.handle as HWND;
        // Use the app's normal maximize command without changing decorations or taking focus.
        // Posting also keeps an unresponsive app from blocking session tracking.
        IsZoomed(hwnd) != 0 || PostMessageW(hwnd, WM_SYSCOMMAND, SC_MAXIMIZE as usize, 0) != 0
    }
}
fn show_for_focus(hwnd: HWND, maximize: bool) {
    unsafe {
        if maximize && can_maximize(hwnd) {
            ShowWindowAsync(hwnd, SW_MAXIMIZE);
        } else if IsIconic(hwnd) != 0 {
            // Restoring an already maximized window would shrink it to its previous size.
            ShowWindowAsync(hwnd, SW_RESTORE);
        }
    }
}
fn focus_window(handle: isize, maximize: bool) -> bool {
    unsafe {
        let hwnd = handle as HWND;
        if IsWindow(hwnd) == 0 {
            return false;
        }
        show_for_focus(hwnd, maximize);
        if SetForegroundWindow(hwnd) != 0 {
            return true;
        }
        let info = FLASHWINFO {
            cbSize: std::mem::size_of::<FLASHWINFO>() as u32,
            hwnd,
            dwFlags: FLASHW_TRAY | FLASHW_TIMERNOFG,
            uCount: 3,
            dwTimeout: 0,
        };
        FlashWindowEx(&info);
        false
    }
}
pub fn snapshot() -> (Vec<Process>, Vec<Window>) {
    unsafe {
        let snap = Handle(CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0));
        let mut processes = Vec::new();
        if snap.0 == INVALID_HANDLE_VALUE {
            return (vec![], vec![]);
        }
        let mut p: PROCESSENTRY32W = std::mem::zeroed();
        p.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let mut ok = Process32FirstW(snap.0, &mut p);
        while ok != 0 {
            let h = Handle(OpenProcess(
                PROCESS_QUERY_LIMITED_INFORMATION,
                0,
                p.th32ProcessID,
            ));
            if !h.0.is_null() {
                if let Some(key) = key_from_handle(h.0, p.th32ProcessID) {
                    let mut path = vec![0u16; 32768];
                    let mut len = path.len() as u32;
                    let value =
                        if QueryFullProcessImageNameW(h.0, 0, path.as_mut_ptr(), &mut len) != 0 {
                            String::from_utf16_lossy(&path[..len as usize])
                        } else {
                            String::new()
                        };
                    processes.push(Process {
                        key,
                        parent: p.th32ParentProcessID,
                        path: value,
                    });
                }
            }
            ok = Process32NextW(snap.0, &mut p);
        }
        let mut handles: Vec<(isize, u32)> = vec![];
        unsafe extern "system" fn enumerate(hwnd: HWND, data: LPARAM) -> i32 {
            unsafe {
                if IsWindowVisible(hwnd) == 0 || GetWindowTextLengthW(hwnd) == 0 {
                    return 1;
                }
                let mut cloaked: u32 = 0;
                let _ = DwmGetWindowAttribute(
                    hwnd,
                    DWMWA_CLOAKED as u32,
                    &mut cloaked as *mut _ as _,
                    4,
                );
                if cloaked != 0 {
                    return 1;
                }
                let mut pid = 0;
                GetWindowThreadProcessId(hwnd, &mut pid);
                if pid != std::process::id() {
                    (*(data as *mut Vec<(isize, u32)>)).push((hwnd as isize, pid));
                }
                1
            }
        }
        EnumWindows(Some(enumerate), &mut handles as *mut _ as isize);
        let windows = handles
            .into_iter()
            .filter_map(|(handle, pid)| {
                processes.iter().find(|p| p.key.pid == pid).map(|p| Window {
                    handle,
                    process: p.key,
                })
            })
            .collect();
        (processes, windows)
    }
}
fn window_still_owned(w: &Window) -> bool {
    unsafe {
        let mut pid = 0;
        GetWindowThreadProcessId(w.handle as HWND, &mut pid);
        pid == w.process.pid && process_key(pid) == Some(w.process)
    }
}
pub fn close(w: &Window) -> Result<(), String> {
    if !window_still_owned(w) {
        return Ok(());
    }
    if unsafe { PostMessageW(w.handle as HWND, WM_CLOSE, 0, 0) } == 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    Ok(())
}
pub fn terminate(key: ProcessKey) -> Result<(), String> {
    unsafe {
        let h = Handle(OpenProcess(
            PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_TERMINATE,
            0,
            key.pid,
        ));
        if h.0.is_null() {
            return Ok(());
        }
        if key_from_handle(h.0, key.pid) != Some(key) {
            return Ok(());
        }
        if TerminateProcess(h.0, 1) == 0 {
            return Err(std::io::Error::last_os_error().to_string());
        }
        Ok(())
    }
}
pub fn launch(app: &AppEntry) -> Result<Option<ProcessKey>, String> {
    supported()?;
    app.target.validate()?;
    let t = &app.target;
    match t.kind {
        TargetKind::Executable => {
            if !Path::new(&t.value).is_file() {
                return Err("Exécutable introuvable. Modifiez cette application.".into());
            }
            let mut cmd = Command::new(&t.value);
            cmd.args(&t.args);
            if let Some(dir) = &t.working_dir {
                if !dir.is_empty() {
                    cmd.current_dir(dir);
                }
            }
            let child = cmd
                .spawn()
                .map_err(|e| format!("Lancement impossible : {e}"))?;
            Ok(key_from_handle(child.as_raw_handle() as HANDLE, child.id()))
        }
        TargetKind::Packaged => unsafe {
            use windows::{
                core::PCWSTR,
                Win32::{
                    System::Com::*,
                    UI::Shell::{
                        ApplicationActivationManager, IApplicationActivationManager, AO_NONE,
                    },
                },
            };
            let init = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            let result = (|| {
                let manager: IApplicationActivationManager =
                    CoCreateInstance(&ApplicationActivationManager, None, CLSCTX_LOCAL_SERVER)?;
                manager.ActivateApplication(
                    PCWSTR(wide(&t.value).as_ptr()),
                    PCWSTR::null(),
                    AO_NONE,
                )
            })();
            if init.is_ok() {
                CoUninitialize();
            }
            result
                .map(process_key)
                .map_err(|e| format!("Activation impossible : {e}"))
        },
        TargetKind::Shortcut | TargetKind::Uri => unsafe {
            let file = wide(&t.value);
            let verb = wide("open");
            let parameters = wide(
                t.args
                    .iter()
                    .map(|a| quote_arg(a))
                    .collect::<Vec<_>>()
                    .join(" "),
            );
            let dir = t.working_dir.as_ref().map(wide);
            let mut info: SHELLEXECUTEINFOW = std::mem::zeroed();
            info.cbSize = std::mem::size_of::<SHELLEXECUTEINFOW>() as u32;
            info.fMask = SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NOASYNC | SEE_MASK_FLAG_NO_UI;
            info.lpVerb = verb.as_ptr();
            info.lpFile = file.as_ptr();
            info.lpParameters = parameters.as_ptr();
            info.lpDirectory = dir.as_ref().map_or(null(), |v| v.as_ptr());
            info.nShow = SW_SHOWNORMAL;
            if ShellExecuteExW(&mut info) == 0 {
                return Err(std::io::Error::last_os_error().to_string());
            }
            let h = Handle(info.hProcess);
            if h.0.is_null() {
                Ok(None)
            } else {
                Ok(key_from_handle(h.0, GetProcessId(h.0)))
            }
        },
    }
}
// Windows command-line quoting, only for ShellExecute's native argument field. Never a shell command.
fn quote_arg(arg: &str) -> String {
    let mut out = String::from("\"");
    let mut slashes = 0;
    for c in arg.chars() {
        if c == '\\' {
            slashes += 1;
            continue;
        }
        if c == '"' {
            out.push_str(&"\\".repeat(slashes * 2 + 1));
        } else {
            out.push_str(&"\\".repeat(slashes));
        }
        slashes = 0;
        out.push(c);
    }
    out.push_str(&"\\".repeat(slashes * 2));
    out.push('"');
    out
}
fn parse_args(raw: &str) -> Vec<String> {
    unsafe {
        if raw.is_empty() {
            return vec![];
        }
        let full = wide(format!("canapey.exe {raw}"));
        let mut count = 0;
        let argv = CommandLineToArgvW(full.as_ptr(), &mut count);
        if argv.is_null() {
            return vec![];
        }
        let result = std::slice::from_raw_parts(argv, count as usize)
            .iter()
            .skip(1)
            .map(|p| {
                let mut len = 0;
                while *p.add(len) != 0 {
                    len += 1
                }
                String::from_utf16_lossy(std::slice::from_raw_parts(*p, len))
            })
            .collect();
        LocalFree(argv as _);
        result
    }
}
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct Found {
    name: String,
    kind: TargetKind,
    value: String,
    raw_arguments: Option<String>,
    working_dir: Option<String>,
    source: String,
    icon: Option<String>,
}
pub fn scan(cache: &Path, single: Option<&Path>) -> Result<Vec<AppEntry>, String> {
    supported()?;
    let exe = Path::new(&std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into()))
        .join("System32/WindowsPowerShell/v1.0/powershell.exe");
    let mut cmd = Command::new(exe);
    cmd.args([
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        include_str!("discover.ps1"),
    ])
    .env("CANAPEY_ICON_CACHE", cache)
    .creation_flags(CREATE_NO_WINDOW)
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
    if let Some(path) = single {
        cmd.env("CANAPEY_SINGLE_LINK", path);
    } else {
        cmd.env_remove("CANAPEY_SINGLE_LINK");
    }
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let mut out = child.stdout.take().unwrap();
    let mut err = child.stderr.take().unwrap();
    let output = std::thread::spawn(move || {
        let mut b = Vec::new();
        out.read_to_end(&mut b).map(|_| b)
    });
    let errors = std::thread::spawn(move || {
        let mut b = String::new();
        err.read_to_string(&mut b).map(|_| b)
    });
    let start = Instant::now();
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            break status;
        }
        if start.elapsed() > Duration::from_secs(60) {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Détection trop longue. Essayez l’ajout manuel.".into());
        }
        std::thread::sleep(Duration::from_millis(100));
    };
    let bytes = output
        .join()
        .map_err(|_| "Détection interrompue")?
        .map_err(|e| e.to_string())?;
    let detail = errors
        .join()
        .unwrap_or(Ok(String::new()))
        .unwrap_or_default();
    if !status.success() {
        log::warn!("Discovery: {detail}");
        return Err("Détection Windows indisponible. L’ajout manuel reste disponible.".into());
    }
    let rows: Vec<Found> =
        serde_json::from_slice(&bytes).map_err(|e| format!("Résultat Windows illisible : {e}"))?;
    Ok(deduplicate(
        rows.into_iter()
            .map(|f| {
                let lower = f.name.to_lowercase();
                let theme = [
                    "youtube", "netflix", "spotify", "internet", "plezy", "steam", "silo",
                ]
                .into_iter()
                .find(|s| lower.split(|c: char| !c.is_alphanumeric()).any(|w| w == *s))
                .unwrap_or("home")
                .to_owned();
                AppEntry {
                    id: uuid::Uuid::new_v4().to_string(),
                    name: f.name,
                    target: Target {
                        kind: f.kind,
                        value: f.value,
                        args: parse_args(f.raw_arguments.as_deref().unwrap_or("")),
                        working_dir: f.working_dir.filter(|s| !s.is_empty()),
                    },
                    theme,
                    card: None,
                    background: None,
                    icon: f.icon,
                    source: f.source,
                }
            })
            .collect(),
    ))
}
fn suspend() -> Result<(), String> {
    use windows_sys::Win32::Security::*;
    unsafe {
        let mut token = std::ptr::null_mut();
        if OpenProcessToken(
            GetCurrentProcess(),
            TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY,
            &mut token,
        ) == 0
        {
            return Err(std::io::Error::last_os_error().to_string());
        }
        let token = Handle(token);
        let mut luid: LUID = std::mem::zeroed();
        if LookupPrivilegeValueW(null(), wide("SeShutdownPrivilege").as_ptr(), &mut luid) == 0 {
            return Err(std::io::Error::last_os_error().to_string());
        }
        let request = TOKEN_PRIVILEGES {
            PrivilegeCount: 1,
            Privileges: [LUID_AND_ATTRIBUTES {
                Luid: luid,
                Attributes: SE_PRIVILEGE_ENABLED,
            }],
        };
        let mut previous: TOKEN_PRIVILEGES = std::mem::zeroed();
        let mut size = 0;
        if AdjustTokenPrivileges(
            token.0,
            0,
            &request,
            std::mem::size_of::<TOKEN_PRIVILEGES>() as u32,
            &mut previous,
            &mut size,
        ) == 0
            || GetLastError() == ERROR_NOT_ALL_ASSIGNED
        {
            return Err("Windows n’autorise pas la mise en veille pour cette session.".into());
        }
        let result = if SetSuspendState(false, false, false) {
            Ok(())
        } else {
            Err(std::io::Error::last_os_error().to_string())
        };
        AdjustTokenPrivileges(
            token.0,
            0,
            &previous,
            0,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        );
        result
    }
}
pub fn power(action: &str) -> Result<(), String> {
    supported()?;
    match action {
        "sleep" => suspend(),
        "restart" | "shutdown" => {
            let exe =
                Path::new(&std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into()))
                    .join("System32/shutdown.exe");
            let result = Command::new(exe)
                .args([if action == "restart" { "/r" } else { "/s" }, "/t", "0"])
                .creation_flags(CREATE_NO_WINDOW)
                .status()
                .map_err(|e| e.to_string())?;
            if result.success() {
                Ok(())
            } else {
                Err("Windows a refusé cette action.".into())
            }
        }
        _ => Err("Action inconnue.".into()),
    }
}

pub fn open_game_bar_settings() -> Result<(), String> {
    // Fixed Settings URI: no caller-controlled target, shell command or registry edits.
    unsafe {
        let target = wide("ms-settings:gaming-gamebar");
        let result = ShellExecuteW(
            std::ptr::null_mut(),
            null(),
            target.as_ptr(),
            null(),
            null(),
            SW_SHOWNORMAL,
        );
        if result as isize <= 32 {
            Err("Impossible d’ouvrir les paramètres Game Bar de Windows.".into())
        } else {
            Ok(())
        }
    }
}

pub fn start_controller(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        use gilrs::{Axis, Button, EventType, Gilrs};
        let mut gilrs = match Gilrs::new() {
            Ok(g) => g,
            Err(e) => {
                log::warn!("Controller init: {e}");
                let _ = app.emit(
                    "native-error",
                    "Manette indisponible. Le clavier reste utilisable.",
                );
                return;
            }
        };
        let start = Instant::now();
        let mut repeat = Repeater::default();
        let mut hold = Hold::default();
        let mut last_tick = Instant::now();
        let mut previous = None;
        let mut active = None;
        let mut buttons: HashMap<(gilrs::GamepadId, Button), bool> = HashMap::new();
        let mut pending_menu = None;
        let mut pending_accept = None;
        let mut block_until_release = false;
        let mut was_foreground = false;
        let mut was_testing = false;
        let mut test_exit = Hold::default();
        let mut test_direction = None;
        let mut test_published = None;
        let publish = |g: &Gilrs, active: Option<gilrs::GamepadId>| {
            let name = active
                .and_then(|id| g.gamepads().find(|(i, _)| *i == id))
                .or_else(|| g.gamepads().next())
                .map(|(_, p)| p.name().to_owned());
            let state = app.state::<crate::runtime::State>();
            let mut previous_name = state.controller.lock().unwrap();
            if *previous_name != name {
                *previous_name = name.clone();
                let _ = app.emit("controller", name);
            }
        };
        publish(&gilrs, active);
        loop {
            let now = start.elapsed().as_millis() as u64;
            let foreground = foreground_is_ours();
            let state = app.state::<crate::runtime::State>();
            let mut testing = state.controller_test.load(Ordering::SeqCst);
            if testing && !foreground {
                state.controller_test.store(false, Ordering::SeqCst);
                testing = false;
                let _ = app.emit("controller-test-ended", ());
            }
            if testing != was_testing {
                repeat.reset();
                previous = None;
                hold = Hold::default();
                test_exit = Hold::default();
                test_direction = None;
                test_published = None;
                pending_menu = None;
                pending_accept = None;
                block_until_release = true;
                let _ = app.emit("input", "accept-cancel");
                was_testing = testing;
            }
            if last_tick.elapsed() > Duration::from_secs(2) || foreground != was_foreground {
                repeat.reset();
                previous = None;
                hold = Hold::default();
                buttons.clear();
                pending_menu = None;
                pending_accept = None;
                let _ = app.emit("input", "accept-cancel");
                block_until_release = true;
            }
            last_tick = Instant::now();
            was_foreground = foreground;
            while let Some(event) = gilrs.next_event() {
                match event.event {
                    EventType::Connected | EventType::Disconnected => {
                        publish(&gilrs, None);
                        repeat.reset();
                        hold = Hold::default();
                        test_exit = Hold::default();
                        test_direction = None;
                        test_published = None;
                        buttons.clear();
                        active = None;
                        pending_menu = None;
                        pending_accept = None;
                        let _ = app.emit("input", "accept-cancel");
                    }
                    EventType::ButtonPressed(b, _) => {
                        active = Some(event.id);
                        publish(&gilrs, active);
                        let was = buttons.insert((event.id, b), true).unwrap_or(false);
                        if !was && foreground && !block_until_release && !testing {
                            match b {
                                Button::South => {
                                    pending_accept = Some(event.id);
                                    let _ = app.emit("input", "accept-down");
                                }
                                Button::West => {
                                    let _ = app.emit("input", "options");
                                }
                                Button::East => {
                                    let _ = app.emit("input", "back");
                                }
                                Button::Start => pending_menu = Some(event.id),
                                _ => {}
                            }
                        }
                    }
                    EventType::ButtonReleased(b, _) => {
                        buttons.insert((event.id, b), false);
                        if b == Button::South && pending_accept == Some(event.id) {
                            pending_accept = None;
                            let action = if foreground && !block_until_release {
                                "accept-up"
                            } else {
                                "accept-cancel"
                            };
                            let _ = app.emit("input", action);
                        }
                        if b == Button::Start
                            && pending_menu.take() == Some(event.id)
                            && foreground
                            && !block_until_release
                            && !testing
                        {
                            let _ = app.emit("input", "menu");
                        }
                    }
                    EventType::AxisChanged(_, v, _) if v.abs() > 0.4 => {
                        active = Some(event.id);
                        publish(&gilrs, active);
                    }
                    _ => {}
                }
            }
            let settings = app
                .state::<crate::runtime::State>()
                .config
                .lock()
                .unwrap()
                .settings
                .clone();
            let pad = active
                .and_then(|id| gilrs.gamepads().find(|(i, _)| *i == id))
                .or_else(|| gilrs.gamepads().next());
            if testing {
                let mut snapshot = ControllerSnapshot::default();
                if let Some((_, p)) = pad {
                    snapshot.name = Some(p.name().to_owned());
                    snapshot.axes = [
                        p.value(Axis::LeftStickX),
                        p.value(Axis::LeftStickY),
                        p.value(Axis::RightStickX),
                        p.value(Axis::RightStickY),
                    ];
                    snapshot.triggers = [
                        p.button_data(Button::LeftTrigger2)
                            .map_or(0.0, |b| b.value()),
                        p.button_data(Button::RightTrigger2)
                            .map_or(0.0, |b| b.value()),
                    ];
                    for (button, name) in [
                        (Button::South, "south"),
                        (Button::East, "east"),
                        (Button::West, "west"),
                        (Button::North, "north"),
                        (Button::LeftTrigger, "lb"),
                        (Button::RightTrigger, "rb"),
                        (Button::LeftTrigger2, "lt"),
                        (Button::RightTrigger2, "rt"),
                        (Button::LeftThumb, "ls"),
                        (Button::RightThumb, "rs"),
                        (Button::Start, "start"),
                        (Button::Select, "select"),
                        (Button::Mode, "guide"),
                        (Button::DPadUp, "up"),
                        (Button::DPadDown, "down"),
                        (Button::DPadLeft, "left"),
                        (Button::DPadRight, "right"),
                    ] {
                        if p.is_pressed(button) {
                            snapshot.buttons.push(name);
                        }
                    }
                    test_direction = stick(
                        snapshot.axes[0],
                        snapshot.axes[1],
                        settings.deadzone,
                        test_direction,
                    );
                    snapshot.direction = test_direction.map(Direction::action);
                } else {
                    test_direction = None;
                }
                if test_exit.tick(snapshot.buttons.contains(&"east"), now, 1200) {
                    state.controller_test.store(false, Ordering::SeqCst);
                    let _ = app.emit("controller-test-ended", ());
                }
                if test_published.is_none_or(|last| now.saturating_sub(last) >= 50) {
                    let _ = app.emit("controller-snapshot", &snapshot);
                    test_published = Some(now);
                }
                std::thread::sleep(Duration::from_millis(12));
                continue;
            }
            if let Some((_, p)) = pad {
                let pressed = |b| p.is_pressed(b);
                let combination = !crate::xbox_home::is_testing(&app)
                    && (foreground || !crate::xbox_home::handles_background(&app))
                    && match settings.return_shortcut.as_str() {
                        "xbox" | "startBack" => pressed(Button::Start) && pressed(Button::Select),
                        "shouldersStart" => {
                            pressed(Button::Start)
                                && pressed(Button::LeftTrigger)
                                && pressed(Button::RightTrigger)
                        }
                        _ => false,
                    };
                if combination {
                    pending_menu = None;
                    if pending_accept.take().is_some() {
                        let _ = app.emit("input", "accept-cancel");
                    }
                }
                if hold.tick(combination && !block_until_release, now, settings.hold_ms) {
                    crate::runtime::show_home(&app);
                    repeat.reset();
                    block_until_release = true;
                }
                let d = if pressed(Button::DPadLeft) {
                    Some(Direction::Left)
                } else if pressed(Button::DPadRight) {
                    Some(Direction::Right)
                } else if pressed(Button::DPadUp) {
                    Some(Direction::Up)
                } else if pressed(Button::DPadDown) {
                    Some(Direction::Down)
                } else {
                    stick(
                        p.value(Axis::LeftStickX),
                        p.value(Axis::LeftStickY),
                        settings.deadzone,
                        previous,
                    )
                };
                previous = d;
                if d.is_none()
                    && !pressed(Button::South)
                    && !pressed(Button::West)
                    && !pressed(Button::East)
                    && !pressed(Button::Start)
                    && !pressed(Button::Select)
                {
                    block_until_release = false;
                }
                if foreground && !block_until_release {
                    if let Some(d) = repeat.tick(d, now) {
                        let _ = app.emit("input", d.action());
                    }
                } else {
                    repeat.reset();
                }
            } else {
                repeat.reset();
                previous = None;
                hold = Hold::default();
            }
            std::thread::sleep(Duration::from_millis(if foreground { 12 } else { 25 }));
        }
    });
}

// The caller must initialize COM on this thread and drop the interface before uninitializing it.
unsafe fn desktop_shell() -> windows::core::Result<windows::Win32::UI::Shell::IShellDispatch4> {
    use windows::Win32::{
        System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER},
        UI::Shell::Shell,
    };
    // Shell.Application is supplied by a DLL, not a standalone COM server.
    // Requesting only CLSCTX_LOCAL_SERVER fails with REGDB_E_CLASSNOTREG (0x80040154).
    CoCreateInstance(&Shell, None, CLSCTX_INPROC_SERVER)
}

pub fn desktop() -> Result<(), String> {
    supported()?;
    unsafe {
        use windows::Win32::System::Com::*;
        CoInitializeEx(None, COINIT_APARTMENTTHREADED)
            .ok()
            .map_err(|e| format!("Initialisation du bureau impossible : {e}"))?;
        let result = (|| {
            let shell = desktop_shell()?;
            shell.ToggleDesktop()
        })();
        CoUninitialize();
        result.map_err(|e| format!("Bureau indisponible : {e}"))
    }
}

/// Open Task View with the Windows shortcut, without foregrounding the launcher.
pub fn task_view() -> Result<(), String> {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::*;
    // Coalesce presses while waiting for the learned shortcut's modifiers to lift.
    static ACTIVE: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let Ok(_guard) = ACTIVE.try_lock() else {
        return Ok(());
    };
    let deadline = Instant::now() + Duration::from_secs(2);
    while [VK_CONTROL, VK_MENU, VK_SHIFT, VK_LWIN, VK_RWIN, VK_TAB]
        .iter()
        .any(|key| unsafe { GetAsyncKeyState(*key as i32) < 0 })
    {
        if Instant::now() >= deadline {
            return Err("Relâchez les touches puis réessayez d’ouvrir la vue des tâches.".into());
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    let input = |key, flags| INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: key,
                dwFlags: flags,
                ..unsafe { std::mem::zeroed() }
            },
        },
    };
    let sequence = [
        input(VK_LWIN, KEYEVENTF_EXTENDEDKEY),
        input(VK_TAB, 0),
        input(VK_TAB, KEYEVENTF_KEYUP),
        input(VK_LWIN, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP),
    ];
    let size = std::mem::size_of::<INPUT>() as i32;
    let sent = unsafe { SendInput(sequence.len() as u32, sequence.as_ptr(), size) };
    if sent != sequence.len() as u32 {
        // Never leave an injected Windows/Tab key down after a partial insertion.
        if sent > 0 {
            let release = [sequence[2], sequence[3]];
            unsafe { SendInput(release.len() as u32, release.as_ptr(), size) };
        }
        return Err("Windows n’a pas accepté l’ouverture de la vue des tâches.".into());
    }
    Ok(())
}

pub fn close_foreground_window() -> Result<(), String> {
    request_window_close(unsafe { GetForegroundWindow() })
}

pub fn escape() -> Result<(), String> {
    remote_navigation("back")
}

pub fn remote_navigation(action: &str) -> Result<(), String> {
    drop(navigation_press(action, true)?);
    Ok(())
}

/// Keep the original recipient until release, even if the foreground changes.
pub struct RemoteKeyPress {
    target: HWND,
    thread: u32,
    key: u16,
    flags: isize,
}
impl Drop for RemoteKeyPress {
    fn drop(&mut self) {
        unsafe {
            if IsWindow(self.target) != 0
                && GetWindowThreadProcessId(self.target, std::ptr::null_mut()) == self.thread
            {
                PostMessageW(
                    self.target,
                    WM_KEYUP,
                    self.key as usize,
                    self.flags | 0xc000_0000,
                );
            }
        }
    }
}

pub fn remote_navigation_press(action: &str) -> Result<RemoteKeyPress, String> {
    // Network events must not wait behind a physical modifier: a queued command
    // could otherwise outlive revocation or the original foreground window.
    navigation_press(action, false)
}

pub fn shortcut_navigation_press(action: &str) -> Result<RemoteKeyPress, String> {
    navigation_press(action, true)
}

fn navigation_press(action: &str, wait_for_modifiers: bool) -> Result<RemoteKeyPress, String> {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::*;
    static ACTIVE: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let Ok(_guard) = ACTIVE.try_lock() else {
        return Err("Une commande de navigation est déjà en cours.".into());
    };
    let foreground = unsafe { GetForegroundWindow() };
    let deadline = Instant::now() + Duration::from_secs(2);
    while [VK_CONTROL, VK_MENU, VK_SHIFT, VK_LWIN, VK_RWIN]
        .iter()
        .any(|key| unsafe { GetAsyncKeyState(*key as i32) < 0 })
    {
        if !wait_for_modifiers || Instant::now() >= deadline {
            return Err("Relâchez les touches puis réessayez d’envoyer la commande.".into());
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    unsafe {
        if GetForegroundWindow() != foreground {
            return Err("La fenêtre active a changé. Réessayez d’envoyer la commande.".into());
        }
        let mut info: GUITHREADINFO = std::mem::zeroed();
        info.cbSize = std::mem::size_of::<GUITHREADINFO>() as u32;
        if GetGUIThreadInfo(0, &mut info) == 0 {
            return Err("Impossible d’identifier la fenêtre active pour la navigation.".into());
        }
        let target = if info.hwndFocus.is_null() {
            info.hwndActive
        } else {
            info.hwndFocus
        };
        post_remote_press(target, action)
    }
}

fn post_remote_press(target: HWND, action: &str) -> Result<RemoteKeyPress, String> {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::*;
    let key = match action {
        "up" => VK_UP,
        "down" => VK_DOWN,
        "left" => VK_LEFT,
        "right" => VK_RIGHT,
        "accept" => VK_RETURN,
        "back" => VK_ESCAPE,
        _ => return Err("Commande de navigation invalide.".into()),
    };
    unsafe {
        if target.is_null() || IsWindow(target) == 0 {
            return Err("Aucune fenêtre active pour recevoir la commande.".into());
        }
        // Target the focused control's queue directly: SendInput would be caught
        // again if Escape is reserved by any of our global remote bindings.
        let scan = MapVirtualKeyW(key as u32, MAPVK_VK_TO_VSC);
        let flags = 1
            | ((scan as isize) << 16)
            | if matches!(key, VK_UP | VK_DOWN | VK_LEFT | VK_RIGHT) {
                1 << 24
            } else {
                0
            };
        let thread = GetWindowThreadProcessId(target, std::ptr::null_mut());
        if PostMessageW(target, WM_KEYDOWN, key as usize, flags) == 0 {
            return Err("Windows n’a pas accepté la commande.".into());
        }
        Ok(RemoteKeyPress {
            target,
            thread,
            key,
            flags,
        })
    }
}

fn request_window_close(target: HWND) -> Result<(), String> {
    unsafe {
        let mut class = [0u16; 256];
        let len = GetClassNameW(target, class.as_mut_ptr(), class.len() as i32);
        if target.is_null()
            || IsWindow(target) == 0
            || target == GetDesktopWindow()
            || target == GetShellWindow()
            || len == 0
            || [
                "Progman",
                "WorkerW",
                "Shell_TrayWnd",
                "Shell_SecondaryTrayWnd",
            ]
            .contains(&String::from_utf16_lossy(&class[..len as usize]).as_ref())
        {
            return Err("Aucune fenêtre d’application active à fermer.".into());
        }
        // A normal close request preserves the application's save/confirmation dialog.
        // Post it so a hung foreground app cannot block the remote listener.
        if PostMessageW(target, WM_CLOSE, 0, 0) == 0 {
            return Err(format!(
                "Windows n’a pas accepté la fermeture : {}",
                std::io::Error::last_os_error()
            ));
        }
    }
    Ok(())
}

/// Dispatch a media command without generating keyboard input. In particular,
/// mapping MediaPlayPause to playPause must not trigger its own global hotkey.
pub fn media_command(action: &str) -> Result<(), String> {
    use windows_sys::Win32::System::SystemServices::*;
    let command = match action {
        "volumeUp" => APPCOMMAND_VOLUME_UP,
        "volumeDown" => APPCOMMAND_VOLUME_DOWN,
        "mute" => APPCOMMAND_VOLUME_MUTE,
        "playPause" => APPCOMMAND_MEDIA_PLAY_PAUSE,
        "previousTrack" => APPCOMMAND_MEDIA_PREVIOUSTRACK,
        "nextTrack" => APPCOMMAND_MEDIA_NEXTTRACK,
        "stop" => APPCOMMAND_MEDIA_STOP,
        _ => return Err("Commande multimédia inconnue.".into()),
    };
    unsafe {
        let mut target = GetForegroundWindow();
        if target.is_null() {
            target = GetShellWindow();
        }
        if target.is_null()
            || SendMessageTimeoutW(
                target,
                WM_APPCOMMAND,
                target as usize,
                (command as isize) << 16,
                SMTO_ABORTIFHUNG,
                1000,
                std::ptr::null_mut(),
            ) == 0
        {
            return Err("Windows n’a pas accepté la commande multimédia.".into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TestWindow(HWND);
    impl TestWindow {
        fn new(class: &str, style: u32, extended: u32, owner: HWND) -> Self {
            unsafe {
                let hwnd = CreateWindowExW(
                    extended,
                    wide(class).as_ptr(),
                    wide("Canapey window test").as_ptr(),
                    style,
                    40,
                    40,
                    400,
                    300,
                    owner,
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    std::ptr::null(),
                );
                assert!(
                    !hwnd.is_null(),
                    "create test window: {}",
                    std::io::Error::last_os_error()
                );
                ShowWindow(hwnd, SW_SHOWNOACTIVATE);
                Self(hwnd)
            }
        }
        fn tracked(&self) -> Window {
            Window {
                handle: self.0 as isize,
                process: process_key(std::process::id()).unwrap(),
            }
        }
    }
    impl Drop for TestWindow {
        fn drop(&mut self) {
            unsafe {
                DestroyWindow(self.0);
            }
        }
    }
    fn dispatch_window_messages() {
        unsafe {
            let mut message: MSG = std::mem::zeroed();
            while PeekMessageW(&mut message, std::ptr::null_mut(), 0, 0, PM_REMOVE) != 0 {
                TranslateMessage(&message);
                DispatchMessageW(&message);
            }
        }
    }
    #[test]
    fn maximization_keeps_window_controls_and_normal_close() {
        let window = TestWindow::new("STATIC", WS_OVERLAPPEDWINDOW, 0, std::ptr::null_mut());
        assert!(maximize(&window.tracked()));
        dispatch_window_messages();
        unsafe {
            assert_ne!(IsZoomed(window.0), 0);
            let style = GetWindowLongW(window.0, GWL_STYLE) as u32;
            assert_eq!(style & WS_OVERLAPPEDWINDOW, WS_OVERLAPPEDWINDOW);
            assert_eq!(
                GetMenuState(GetSystemMenu(window.0, 0), SC_CLOSE, MF_BYCOMMAND)
                    & (MF_DISABLED | MF_GRAYED),
                0
            );
        }
        close(&window.tracked()).unwrap();
        dispatch_window_messages();
        assert_eq!(unsafe { IsWindow(window.0) }, 0);
    }
    #[test]
    fn remote_close_posts_a_normal_request_and_rejects_desktop_or_stale_windows() {
        assert!(request_window_close(std::ptr::null_mut()).is_err());
        assert!(request_window_close(unsafe { GetDesktopWindow() }).is_err());
        assert!(request_window_close(unsafe { GetShellWindow() }).is_err());
        let window = TestWindow::new("STATIC", WS_OVERLAPPEDWINDOW, 0, std::ptr::null_mut());
        request_window_close(window.0).unwrap();
        // The recipient processes WM_CLOSE itself; no process is terminated.
        assert_ne!(unsafe { IsWindow(window.0) }, 0);
        dispatch_window_messages();
        assert_eq!(unsafe { IsWindow(window.0) }, 0);
        assert!(request_window_close(window.0).is_err());
    }
    #[test]
    fn remote_enter_releases_original_window_without_hotkey_feedback() {
        let original = TestWindow::new("STATIC", WS_OVERLAPPEDWINDOW, 0, std::ptr::null_mut());
        let other = TestWindow::new("STATIC", WS_OVERLAPPEDWINDOW, 0, std::ptr::null_mut());
        let press = post_remote_press(original.0, "accept").unwrap();
        unsafe {
            SetForegroundWindow(other.0);
        }
        drop(press);
        unsafe {
            let mut message: MSG = std::mem::zeroed();
            for kind in [WM_KEYDOWN, WM_KEYUP] {
                assert_ne!(
                    PeekMessageW(&mut message, original.0, kind, kind, PM_REMOVE),
                    0
                );
                assert_eq!(message.wParam, 0x0d);
                assert_eq!(
                    PeekMessageW(&mut message, other.0, kind, kind, PM_REMOVE),
                    0
                );
            }
            assert_eq!(
                PeekMessageW(&mut message, original.0, WM_HOTKEY, WM_HOTKEY, PM_REMOVE),
                0
            );
        }
    }
    #[test]
    fn remote_escape_targets_window_queue_with_both_key_edges() {
        let window = TestWindow::new("STATIC", WS_OVERLAPPEDWINDOW, 0, std::ptr::null_mut());
        assert!(post_remote_press(std::ptr::null_mut(), "back").is_err());
        let press = post_remote_press(window.0, "back").unwrap();
        unsafe {
            let mut message: MSG = std::mem::zeroed();
            assert_eq!(
                PeekMessageW(&mut message, window.0, WM_KEYUP, WM_KEYUP, PM_REMOVE),
                0
            );
        }
        drop(press);
        unsafe {
            let mut message: MSG = std::mem::zeroed();
            for (kind, flags) in [(WM_KEYDOWN, 0x0001_0001), (WM_KEYUP, 0xc001_0001)] {
                assert_ne!(
                    PeekMessageW(&mut message, window.0, kind, kind, PM_REMOVE),
                    0
                );
                assert_eq!(message.wParam, 0x1b);
                assert_eq!(message.lParam, flags);
            }
            assert_eq!(
                PeekMessageW(&mut message, window.0, WM_HOTKEY, WM_HOTKEY, PM_REMOVE),
                0
            );
        }
    }
    #[test]
    fn resume_maximizes_normal_and_minimized_windows_and_preserves_maximized_state() {
        let window = TestWindow::new("STATIC", WS_OVERLAPPEDWINDOW, 0, std::ptr::null_mut());
        for state in [SW_SHOWNORMAL, SW_MINIMIZE, SW_MAXIMIZE] {
            unsafe {
                ShowWindow(window.0, state);
            }
            show_for_focus(window.0, true);
            dispatch_window_messages();
            assert_ne!(unsafe { IsZoomed(window.0) }, 0);
        }
        show_for_focus(window.0, false);
        dispatch_window_messages();
        assert_ne!(unsafe { IsZoomed(window.0) }, 0);
    }
    #[test]
    fn maximization_ignores_dialogs_fixed_windows_tools_and_stale_processes() {
        let owner = TestWindow::new("STATIC", WS_OVERLAPPEDWINDOW, 0, std::ptr::null_mut());
        for (class, style, extended, parent) in [
            (
                "STATIC",
                WS_OVERLAPPEDWINDOW & !WS_THICKFRAME,
                0,
                std::ptr::null_mut(),
            ),
            (
                "STATIC",
                WS_OVERLAPPEDWINDOW & !WS_MAXIMIZEBOX,
                0,
                std::ptr::null_mut(),
            ),
            (
                "STATIC",
                WS_OVERLAPPEDWINDOW,
                WS_EX_TOOLWINDOW,
                std::ptr::null_mut(),
            ),
            (
                "STATIC",
                WS_OVERLAPPEDWINDOW,
                WS_EX_NOACTIVATE,
                std::ptr::null_mut(),
            ),
            ("STATIC", WS_OVERLAPPEDWINDOW, 0, owner.0),
            ("#32770", WS_OVERLAPPEDWINDOW, 0, std::ptr::null_mut()),
        ] {
            let window = TestWindow::new(class, style, extended, parent);
            assert!(!maximize(&window.tracked()));
            show_for_focus(window.0, true);
            dispatch_window_messages();
            assert_eq!(unsafe { IsZoomed(window.0) }, 0);
        }
        let mut stale = owner.tracked();
        stale.process.born += 1;
        assert!(!maximize(&stale));
        assert!(!focus_app(&stale));
    }
    #[test]
    fn desktop_shell_can_be_created() {
        use windows::Win32::System::Com::*;
        unsafe {
            CoInitializeEx(None, COINIT_APARTMENTTHREADED)
                .ok()
                .expect("initialize COM for the desktop shell test");
            // Exercise the actual activation path without toggling the test machine's desktop.
            let result = desktop_shell().map(drop);
            CoUninitialize();
            result.expect("activate Shell.Application for Return to Windows");
        }
    }

    #[test]
    fn shell_arguments_roundtrip() {
        let a = vec![
            "".to_string(),
            "a b".into(),
            "C:\\trail\\".into(),
            "a\"b".into(),
            "& calc".into(),
        ];
        assert_eq!(
            parse_args(&a.iter().map(|s| quote_arg(s)).collect::<Vec<_>>().join(" ")),
            a
        );
    }
}
