use serde::Serialize;
use std::{
    sync::Mutex,
    time::{Duration, Instant},
};
#[cfg(windows)]
use tauri::Manager;

#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct XboxStatus {
    pub available: bool,
    pub connected: bool,
    pub test: TestResult,
}

#[derive(Clone, Copy, Serialize, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(not(windows), allow(dead_code))] // Result states produced by the Windows listener.
pub enum TestResult {
    #[default]
    Idle,
    Listening,
    Detected,
    Timeout,
}

#[derive(Default)]
pub struct XboxHomeState(Mutex<Monitor>);
#[derive(Default)]
struct Monitor {
    status: XboxStatus,
    deadline: Option<Instant>,
}

#[tauri::command]
pub fn xbox_home_status(state: tauri::State<XboxHomeState>) -> XboxStatus {
    state.0.lock().unwrap().status.clone()
}

#[tauri::command]
pub fn test_xbox_button(state: tauri::State<XboxHomeState>) -> Result<XboxStatus, String> {
    let mut m = state.0.lock().unwrap();
    if !m.status.available {
        return Err(
            "Xbox detection unavailable on this PC. Use a fallback button combination.".into(),
        );
    }
    if !m.status.connected {
        return Err("Connect an Xbox-compatible controller and try again.".into());
    }
    m.status.test = TestResult::Listening;
    m.deadline = Some(Instant::now() + Duration::from_secs(15));
    Ok(m.status.clone())
}

#[tauri::command]
pub fn cancel_xbox_test(state: tauri::State<XboxHomeState>) {
    let mut m = state.0.lock().unwrap();
    m.deadline = None;
    m.status.test = TestResult::Idle;
}

#[tauri::command]
pub fn open_game_bar_settings() -> Result<(), String> {
    crate::platform::open_game_bar_settings()
}

#[cfg(windows)]
pub fn is_testing(app: &tauri::AppHandle) -> bool {
    app.state::<XboxHomeState>().0.lock().unwrap().status.test == TestResult::Listening
}

#[cfg(windows)]
pub fn handles_background(app: &tauri::AppHandle) -> bool {
    let m = app.state::<XboxHomeState>();
    let m = m.0.lock().unwrap();
    m.status.connected || m.status.test == TestResult::Listening
}

#[cfg(windows)]
pub fn start(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        use crate::{home_shortcut::HomeShortcut, platform::XboxInput, runtime::State};
        use std::sync::atomic::Ordering;
        let input = XboxInput::new();
        let mut shortcut = HomeShortcut::default();
        let started = Instant::now();
        loop {
            let pads = input.sample();
            let state = app.state::<State>();
            let settings = state.config.lock().unwrap().settings.clone();
            let controller_testing = state.controller_test.load(Ordering::SeqCst);
            let background = !crate::platform::foreground_is_ours();
            let monitor = app.state::<XboxHomeState>();
            let mut m = monitor.0.lock().unwrap();
            m.status.available = input.guide_available;
            m.status.connected = pads.iter().any(Option::is_some);
            let testing = m.status.test == TestResult::Listening;
            let mode = if testing || controller_testing {
                "test"
            } else {
                &settings.return_shortcut
            };
            let event = shortcut.tick(
                pads,
                mode,
                background,
                started.elapsed().as_millis() as u64,
                settings.hold_ms,
            );
            if testing {
                if m.deadline.is_some_and(|d| Instant::now() >= d) {
                    m.status.test = TestResult::Timeout;
                    m.deadline = None;
                } else if event.guide {
                    m.status.test = TestResult::Detected;
                    m.deadline = None;
                }
            }
            let home = event.home;
            drop(m);
            if home {
                crate::runtime::show_home(&app);
            }
            std::thread::sleep(Duration::from_millis(12));
        }
    });
}

#[cfg(not(windows))]
pub fn start(_: tauri::AppHandle) {}
