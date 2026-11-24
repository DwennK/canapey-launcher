//! Silo owns authentication and playback. Only the launcher can create this window.
use tauri::{AppHandle, Manager, Url};

#[derive(Default)]
pub struct SiloState(tokio::sync::Mutex<Option<Url>>);

fn present(window: &tauri::WebviewWindow) -> Result<(), String> {
    window.set_fullscreen(true).map_err(|e| e.to_string())?;
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

async fn window_for(app: &AppHandle, url: &Url) -> Result<tauri::WebviewWindow, String> {
    crate::platform::supported()?;
    let state = app.state::<SiloState>();
    let mut current = state.0.lock().await;
    if let Some(window) = app.get_webview_window("silo") {
        if current.as_ref() == Some(url) {
            return Ok(window);
        }
        window.destroy().map_err(|e| e.to_string())?;
    }
    #[cfg(windows)]
    {
        let window = windows::open(app, url).await?;
        *current = Some(url.clone());
        Ok(window)
    }
    #[cfg(not(windows))]
    Err("Silo requires Windows.".into())
}

#[tauri::command]
pub async fn open_silo(
    app: AppHandle,
    server: String,
    content_id: Option<String>,
) -> Result<(), String> {
    let url = crate::silo_policy::address(&server)?;
    let target = content_id
        .as_deref()
        .map(|id| crate::silo_policy::watch_url(&url, id))
        .transpose()?;
    let window = window_for(&app, &url).await?;
    if let Some(target) = target {
        window.navigate(target).map_err(|e| e.to_string())?;
    }
    present(&window)
}

#[tauri::command]
pub async fn silo_continue_watching(
    app: AppHandle,
    server: String,
) -> Result<serde_json::Value, String> {
    let url = crate::silo_policy::address(&server)?;
    let window = window_for(&app, &url).await?;
    #[cfg(windows)]
    return windows::continue_watching(&window, &url).await;
    #[cfg(not(windows))]
    {
        let _ = window;
        Err("Silo requires Windows.".into())
    }
}

#[cfg(windows)]
mod windows;
#[cfg(windows)]
pub use windows::{navigation_press, playback_press};
