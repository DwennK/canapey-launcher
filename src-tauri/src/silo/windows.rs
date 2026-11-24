use super::*;
use ::windows::core::Interface;
use tauri::{webview::NewWindowResponse, Emitter, WebviewUrl, WebviewWindowBuilder};
use webview2_com::{
    AcceleratorKeyPressedEventHandler, Microsoft::Web::WebView2::Win32::*,
    NavigationCompletedEventHandler,
};

pub async fn open(app: &AppHandle, url: &Url) -> Result<tauri::WebviewWindow, String> {
    let origin = url.origin();
    let script = format!(
        "if (window === top && location.origin === {}) {{ {} {} }}",
        serde_json::to_string(&origin.ascii_serialization()).unwrap(),
        include_str!("navigation.js"),
        include_str!("continue-watching.js")
    );
    // Install the native error and keyboard handlers before the first network request.
    let blank = Url::parse("about:blank").unwrap();
    let window = WebviewWindowBuilder::new(app, "silo", WebviewUrl::External(blank))
        .title("Silo")
        .visible(false)
        .focused(false)
        .decorations(false)
        .data_directory(
            app.path()
                .app_local_data_dir()
                .map_err(|e| e.to_string())?
                .join("silo-webview"),
        )
        .initialization_script(script)
        .on_navigation(move |next| crate::silo_policy::allows_navigation(&origin, next))
        .on_new_window(|_, _| NewWindowResponse::Deny)
        .build()
        .map_err(|e| e.to_string())?;
    let result = async {
        install_handlers(app, &window).await?;
        if let Some(monitor) = app
            .get_webview_window("main")
            .and_then(|w| w.current_monitor().ok().flatten())
        {
            window
                .set_position(*monitor.position())
                .map_err(|e| e.to_string())?;
        }
        window.navigate(url.clone()).map_err(|e| e.to_string())
    }
    .await;
    if result.is_err() {
        let _ = window.destroy();
    }
    result.map(|()| window)
}

// Await the Silo page's read without granting remote content access to launcher IPC.
pub async fn continue_watching(
    window: &tauri::WebviewWindow,
    url: &Url,
) -> Result<serde_json::Value, String> {
    use ::windows::core::{w, HSTRING};
    let origin = serde_json::to_string(&url.origin().ascii_serialization()).unwrap();
    let params = serde_json::json!({
        "expression": format!("location.origin === {origin} ? (window.canapeyContinueWatching?.() ?? null) : null"),
        "awaitPromise": true, "returnByValue": true
    });
    let (send, mut receive) = tokio::sync::mpsc::unbounded_channel();
    window
        .with_webview(move |view| unsafe {
            let complete = send.clone();
            let callback = webview2_com::CallDevToolsProtocolMethodCompletedHandler::create(
                Box::new(move |status, json| {
                    let _ = complete.send(status.map(|_| json).map_err(|e| e.to_string()));
                    Ok(())
                }),
            );
            let result = view.controller().CoreWebView2().and_then(|core| {
                core.CallDevToolsProtocolMethod(
                    w!("Runtime.evaluate"),
                    &HSTRING::from(params.to_string()),
                    &callback,
                )
            });
            if let Err(error) = result {
                let _ = send.send(Err(error.to_string()));
            }
        })
        .map_err(|e| e.to_string())?;
    let json = tokio::time::timeout(std::time::Duration::from_secs(9), receive.recv())
        .await
        .map_err(|_| "Silo read timed out.")?
        .ok_or("Silo window closed.")??;
    let mut response: serde_json::Value = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    if response.get("exceptionDetails").is_some() {
        return Err("Silo row unavailable.".into());
    }
    Ok(response["result"]["value"].take())
}

async fn install_handlers(app: &AppHandle, window: &tauri::WebviewWindow) -> Result<(), String> {
    let handle = app.clone();
    let hwnd = window.hwnd().map_err(|e| e.to_string())?.0 as isize;
    let (send, receive) = tokio::sync::oneshot::channel();
    window
        .with_webview(move |view| {
            let result = register_handlers(view.controller(), handle, hwnd);
            let _ = send.send(result.map_err(|e| e.to_string()));
        })
        .map_err(|e| e.to_string())?;
    receive.await.map_err(|e| e.to_string())?
}

fn register_handlers(
    controller: ICoreWebView2Controller,
    app: AppHandle,
    hwnd: isize,
) -> ::windows::core::Result<()> {
    let home = app.clone();
    unsafe {
        let mut token = 0;
        controller.add_AcceleratorKeyPressed(
            &AcceleratorKeyPressedEventHandler::create(Box::new(move |_, args| {
                let Some(args) = args else { return Ok(()) };
                let mut key = 0;
                args.VirtualKey(&mut key)?;
                if key == 0x24 {
                    args.SetHandled(true)?;
                    let mut kind = COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN;
                    let mut physical = COREWEBVIEW2_PHYSICAL_KEY_STATUS::default();
                    args.KeyEventKind(&mut kind)?;
                    args.PhysicalKeyStatus(&mut physical)?;
                    if kind == COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN
                        && !physical.WasKeyDown.as_bool()
                    {
                        let app = home.clone();
                        tauri::async_runtime::spawn(async move {
                            crate::runtime::show_home(&app);
                        });
                    }
                }
                Ok(())
            })),
            &mut token,
        )?;
        controller.CoreWebView2()?.add_NavigationCompleted(
            &NavigationCompletedEventHandler::create(Box::new(move |_, args| {
                if let Some(args) = args {
                    let mut success = Default::default();
                    let mut status = COREWEBVIEW2_WEB_ERROR_STATUS_UNKNOWN;
                    let mut http = 0;
                    args.IsSuccess(&mut success)?;
                    args.WebErrorStatus(&mut status)?;
                    if let Ok(response) = args.cast::<ICoreWebView2NavigationCompletedEventArgs2>()
                    {
                        response.HttpStatusCode(&mut http)?;
                    }
                    if (!success.as_bool()
                        && status != COREWEBVIEW2_WEB_ERROR_STATUS_OPERATION_CANCELED)
                        || http >= 400
                    {
                        let app = app.clone();
                        tauri::async_runtime::spawn(async move {
                            unavailable(app, hwnd);
                        });
                    }
                }
                Ok(())
            })),
            &mut token,
        )
    }
}

fn unavailable(app: AppHandle, hwnd: isize) {
    // A callback queued by an old window must never close its replacement.
    let Some(window) = app.get_webview_window("silo") else {
        return;
    };
    if window.hwnd().ok().map(|h| h.0 as isize) != Some(hwnd) {
        return;
    }
    let focused = crate::platform::foreground_webview(&app, "silo").is_some();
    let _ = window.destroy();
    if focused {
        crate::runtime::show_home(&app);
        let _ = app.emit_to("main", "silo-unavailable", ());
    }
}

// Deliver a complete key to this Chromium instance. No Windows keyboard injection,
// held hotkey modifiers or second trip through RegisterHotKey.
pub fn navigation_press(window: &tauri::WebviewWindow, action: &str) -> Result<(), String> {
    use ::windows::core::{w, HSTRING};
    let (key, vk) = match action {
        "up" => ("ArrowUp", 38),
        "down" => ("ArrowDown", 40),
        "left" => ("ArrowLeft", 37),
        "right" => ("ArrowRight", 39),
        "accept" => ("Enter", 13),
        "back" => ("Escape", 27),
        "playPause" => ("MediaPlayPause", 0xB3),
        "previousTrack" => ("MediaTrackPrevious", 0xB1),
        "nextTrack" => ("MediaTrackNext", 0xB0),
        "stop" => ("MediaStop", 0xB2),
        _ => return Err("Unsupported Silo navigation key.".into()),
    };
    // Both callers run on ordered input workers. Wait there for Chromium to acknowledge
    // each edge, so the next press cannot overtake the previous release.
    for edge in ["keyDown", "keyUp"] {
        let params = serde_json::json!({
            "type": edge, "key": key, "code": key, "windowsVirtualKeyCode": vk,
            "text": if edge == "keyDown" && vk == 13 { "\r" } else { "" }
        });
        let (done, received) = std::sync::mpsc::channel();
        window
            .with_webview(move |view| unsafe {
                let ack = done.clone();
                let callback = webview2_com::CallDevToolsProtocolMethodCompletedHandler::create(
                    Box::new(move |result, _| {
                        let _ = ack.send(result.map_err(|e| e.to_string()));
                        Ok(())
                    }),
                );
                let result = view.controller().CoreWebView2().and_then(|core| {
                    core.CallDevToolsProtocolMethod(
                        w!("Input.dispatchKeyEvent"),
                        &HSTRING::from(params.to_string()),
                        &callback,
                    )
                });
                if let Err(error) = result {
                    let _ = done.send(Err(error.to_string()));
                }
            })
            .map_err(|e| e.to_string())?;
        received
            .recv_timeout(std::time::Duration::from_secs(2))
            .map_err(|e| e.to_string())??;
    }
    Ok(())
}

// Called on the ordered input worker, never the WebView2 UI thread.
pub fn playback_press(app: &AppHandle, action: &str) -> Result<(), String> {
    if matches!(action, "playPause" | "previousTrack" | "nextTrack" | "stop") {
        if let Some(window) = crate::platform::foreground_webview(app, "silo") {
            return navigation_press(&window, action);
        }
    }
    crate::platform::media_command(action)
}
