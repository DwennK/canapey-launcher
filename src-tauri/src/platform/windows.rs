use crate::{
    input::{stick, Direction, Hold, Repeater},
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
    unsafe {
        let hwnd = handle as HWND;
        if IsWindow(hwnd) == 0 {
            return false;
        }
        ShowWindow(hwnd, SW_RESTORE);
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
        let publish = |g: &Gilrs| {
            let name = g.gamepads().next().map(|(_, p)| p.name().to_owned());
            *app.state::<crate::runtime::State>()
                .controller
                .lock()
                .unwrap() = name.clone();
            let _ = app.emit("controller", name);
        };
        publish(&gilrs);
        loop {
            let now = start.elapsed().as_millis() as u64;
            let foreground = foreground_is_ours();
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
                        publish(&gilrs);
                        repeat.reset();
                        hold = Hold::default();
                        buttons.clear();
                        active = None;
                        pending_menu = None;
                        pending_accept = None;
                        let _ = app.emit("input", "accept-cancel");
                    }
                    EventType::ButtonPressed(b, _) => {
                        active = Some(event.id);
                        let was = buttons.insert((event.id, b), true).unwrap_or(false);
                        if !was && foreground && !block_until_release {
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
                        {
                            let _ = app.emit("input", "menu");
                        }
                    }
                    EventType::AxisChanged(_, v, _) if v.abs() > 0.4 => active = Some(event.id),
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
            if let Some((_, p)) = pad {
                let pressed = |b| p.is_pressed(b);
                let combination = match settings.return_shortcut.as_str() {
                    "startBack" => pressed(Button::Start) && pressed(Button::Select),
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
                if hold.tick(combination, now, settings.hold_ms) {
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

pub fn desktop() -> Result<(), String> {
    supported()?;
    unsafe {
        use windows::Win32::{
            System::Com::*,
            UI::Shell::{IShellDispatch4, Shell},
        };
        let init = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let result = (|| {
            let shell: IShellDispatch4 = CoCreateInstance(&Shell, None, CLSCTX_LOCAL_SERVER)?;
            shell.ToggleDesktop()
        })();
        if init.is_ok() {
            CoUninitialize();
        }
        result.map_err(|e| format!("Bureau indisponible : {e}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
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
