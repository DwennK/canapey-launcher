use crate::remote_shortcut::{RemoteBinding, RemoteShortcut};
use serde::Serialize;
use std::{sync::Mutex, time::Instant};
use tauri::Manager;

#[derive(Default)]
pub struct RemoteHomeState(Mutex<Inner>);
#[derive(Default)]
struct Inner {
    active: Vec<RemoteBinding>,
    error: Option<String>,
    capture_until: Option<Instant>,
    #[cfg(windows)]
    last_press: Option<(String, Instant)>,
    #[cfg(windows)]
    dispatch: Option<std::sync::mpsc::Sender<(RemoteBinding, bool)>>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    available: bool,
    active: Vec<RemoteBinding>,
    error: Option<String>,
}
#[tauri::command]
pub fn remote_home_status(app: tauri::AppHandle) -> Status {
    let state = app.state::<RemoteHomeState>();
    let inner = state.0.lock().unwrap();
    Status {
        available: cfg!(windows),
        active: inner.active.clone(),
        error: inner.error.clone(),
    }
}
#[tauri::command]
pub fn set_remote_capture(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    crate::platform::supported()?;
    if enabled
        && !app
            .get_webview_window("main")
            .is_some_and(|w| w.is_focused().unwrap_or(false))
    {
        return Err("Return to Canapey to map a button.".into());
    }
    app.state::<RemoteHomeState>()
        .0
        .lock()
        .unwrap()
        .capture_until = enabled.then(|| Instant::now() + std::time::Duration::from_secs(20));
    Ok(())
}

#[cfg(windows)]
fn register(app: &tauri::AppHandle, key: &RemoteShortcut) -> Result<(), String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    key.validate()?;
    app.global_shortcut().register(key.accelerator().as_str())
        .map_err(|_| "This shortcut is already in use or reserved by Windows. Choose another key; your previous setting is preserved.".into())
}
#[cfg(windows)]
fn unregister(app: &tauri::AppHandle, key: &RemoteShortcut) {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    if let Err(e) = app.global_shortcut().unregister(key.accelerator().as_str()) {
        log::warn!("Remote shortcut cleanup: {e}");
    }
}

// Called under the save lock, without holding config or RemoteHomeState across UI dispatch.
pub fn save_with_binding(
    app: &tauri::AppHandle,
    desired: &[RemoteBinding],
    save: impl FnOnce() -> Result<(), String>,
) -> Result<(), String> {
    #[cfg(windows)]
    {
        let state = app.state::<RemoteHomeState>();
        let old = state.0.lock().unwrap().active.clone();
        crate::remote_shortcut::replace_bindings(
            &old,
            &desired
                .iter()
                .filter(|b| b.global)
                .cloned()
                .collect::<Vec<_>>(),
            |key| register(app, key),
            save,
            |key| unregister(app, key),
        )?;
        let mut inner = state.0.lock().unwrap();
        inner.active = desired.iter().filter(|b| b.global).cloned().collect();
        inner.error = None;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = (app, desired);
        save()
    }
}

pub fn start(app: &tauri::AppHandle, desired: &[RemoteBinding]) {
    #[cfg(windows)]
    {
        let dispatch = crate::runtime::remote_dispatcher(app.clone());
        let mut active = Vec::new();
        let mut errors = Vec::new();
        for binding in desired.iter().filter(|b| b.global) {
            match register(app, &binding.key) {
                Ok(()) => active.push(binding.clone()),
                Err(e) => errors.push(format!("{} : {e}", binding.button)),
            }
        }
        let state = app.state::<RemoteHomeState>();
        let mut inner = state.0.lock().unwrap();
        inner.dispatch = Some(dispatch);
        inner.active = active;
        inner.error = (!errors.is_empty()).then(|| errors.join("\n"));
    }
    #[cfg(not(windows))]
    let _ = (app, desired);
}

#[cfg(windows)]
pub fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    use tauri::Emitter;
    use tauri_plugin_global_shortcut::{Shortcut, ShortcutState};
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event| {
            let pressed = event.state() == ShortcutState::Pressed;
            let Some(state) = app.try_state::<RemoteHomeState>() else {
                return;
            };
            let (binding, capturing) = {
                let mut inner = state.0.lock().unwrap();
                let Some(binding) = inner
                    .active
                    .iter()
                    .find(|b| {
                        b.key.accelerator().parse::<Shortcut>().ok().as_ref() == Some(shortcut)
                    })
                    .cloned()
                else {
                    return;
                };
                let now = Instant::now();
                // Flirc can emit discrete down/up pairs while a button is held.
                let repeated = inner.last_press.as_ref().is_some_and(|(button, last)| {
                    button == &binding.button
                        && now.duration_since(*last).as_millis()
                            < if ["volumeUp", "volumeDown", "up", "down", "left", "right"]
                                .contains(&binding.action.as_str())
                            {
                                100
                            } else {
                                500
                            }
                });
                if pressed {
                    inner.last_press = Some((binding.button.clone(), now));
                    if repeated && binding.action != "accept" {
                        return;
                    }
                }
                let capturing = inner.capture_until.is_some_and(|deadline| deadline > now)
                    && app
                        .get_webview_window("main")
                        .is_some_and(|w| w.is_focused().unwrap_or(false));
                (binding, capturing)
            };
            if capturing {
                if pressed {
                    let _ = app.emit("remote-home-captured", binding.key);
                }
            } else if let Some(tx) = &state.0.lock().unwrap().dispatch {
                let _ = tx.send((binding, pressed));
            }
        })
        .build()
}
