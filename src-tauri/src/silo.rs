//! Silo owns authentication and playback. Only the launcher can create this window.
use tauri::{AppHandle, Manager, Url};

#[derive(Default)]
pub struct SiloState(tokio::sync::Mutex<Option<Url>>);

fn present(window: &tauri::WebviewWindow) -> Result<(), String> {
    window
        .show()
        .and_then(|_| window.unminimize())
        .and_then(|_| window.set_focus())
        .map_err(|e| e.to_string())?;
    #[cfg(windows)]
    if let Ok(handle) = window.hwnd() {
        crate::platform::focus(handle.0 as isize);
    }
    window.as_ref().set_focus().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_silo(app: AppHandle, server: String) -> Result<(), String> {
    crate::platform::supported()?;
    let url = crate::silo_policy::address(&server)?;
    let state = app.state::<SiloState>();
    let mut current = state.0.lock().await;
    if let Some(window) = app.get_webview_window("silo") {
        if current.as_ref() == Some(&url) {
            present(&window)?;
            return Ok(());
        }
        window.destroy().map_err(|e| e.to_string())?;
    }
    #[cfg(windows)]
    windows::open(&app, &url).await?;
    *current = Some(url);
    Ok(())
}

#[cfg(windows)]
mod windows;
#[cfg(windows)]
pub use windows::{navigation_press, playback_press};
