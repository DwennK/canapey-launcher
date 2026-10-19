use crate::apple_remote::{Hub, PairingStatus, Settings};
use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use tauri::{Emitter, Manager};
use tokio::sync::watch;
#[cfg(windows)]
mod windows;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Network {
    pub id: String,
    pub label: String,
    pub address: String,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub available: bool,
    pub running: bool,
    pub networks: Vec<Network>,
    pub address: Option<String>,
    pub error: Option<String>,
    pub pairing: PairingStatus,
}
impl Default for Status {
    fn default() -> Self {
        Self {
            available: cfg!(windows),
            running: false,
            networks: vec![],
            address: None,
            error: None,
            pairing: PairingStatus {
                pin: None,
                seconds_remaining: 0,
                devices: vec![],
            },
        }
    }
}
pub struct AppleRemoteState {
    status: Mutex<Status>,
    hub: Mutex<Option<Arc<Hub>>>,
    desired: watch::Sender<Settings>,
    stop: watch::Sender<bool>,
    started: AtomicBool,
}
impl AppleRemoteState {
    pub fn new(settings: Settings) -> Self {
        Self {
            status: Mutex::new(Status::default()),
            hub: Mutex::new(None),
            desired: watch::channel(settings).0,
            stop: watch::channel(false).0,
            started: AtomicBool::new(false),
        }
    }
    fn snapshot(&self) -> Status {
        let mut s = self.status.lock().unwrap().clone();
        if let Some(hub) = self.hub.lock().unwrap().as_ref() {
            s.pairing = hub.status();
        }
        s
    }
}
pub fn configure(app: &tauri::AppHandle, settings: Settings) {
    app.state::<AppleRemoteState>()
        .desired
        .send_replace(settings);
}
pub fn shutdown(app: &tauri::AppHandle) {
    let state = app.state::<AppleRemoteState>();
    state.stop.send_replace(true);
    if let Some(hub) = state.hub.lock().unwrap().take() {
        hub.cancel_pairing();
    };
}
pub fn start(app: &tauri::AppHandle) {
    let state = app.state::<AppleRemoteState>();
    if state.started.swap(true, Ordering::SeqCst) {
        return;
    }
    #[cfg(windows)]
    {
        let handle = app.clone();
        tauri::async_runtime::spawn(async move {
            supervise(handle).await;
        });
    }
}
#[tauri::command]
pub fn apple_remote_status(app: tauri::AppHandle) -> Status {
    app.state::<AppleRemoteState>().snapshot()
}
#[tauri::command]
pub fn apple_remote_pair(app: tauri::AppHandle) -> Result<(), String> {
    if !app
        .get_webview_window("main")
        .is_some_and(|w| w.is_focused().unwrap_or(false))
    {
        return Err("Revenez dans Canapey pour associer un iPhone.".into());
    }
    let state = app.state::<AppleRemoteState>();
    if !state.status.lock().unwrap().running {
        return Err("Activez la télécommande sur un réseau privé disponible.".into());
    }
    state
        .hub
        .lock()
        .unwrap()
        .as_ref()
        .ok_or("Service indisponible.")?
        .begin_pairing()
        .map_err(|e| e.to_string())?;
    let _ = app.emit("apple-remote-status", state.snapshot());
    Ok(())
}
#[tauri::command]
pub fn apple_remote_cancel_pairing(app: tauri::AppHandle) {
    let state = app.state::<AppleRemoteState>();
    if let Some(hub) = state.hub.lock().unwrap().as_ref() {
        hub.cancel_pairing();
    };
}
#[tauri::command]
pub fn apple_remote_forget(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let state = app.state::<AppleRemoteState>();
    state
        .hub
        .lock()
        .unwrap()
        .as_ref()
        .ok_or("Service indisponible.")?
        .revoke(&id)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(windows)]
async fn supervise(app: tauri::AppHandle) {
    use crate::apple_remote::server::Server;
    use std::time::Duration;
    let state = app.state::<AppleRemoteState>();
    let mut desired = state.desired.subscribe();
    let mut stop = state.stop.subscribe();
    let mut server: Option<Server> = None;
    let mut active: Option<(String, String)> = None;
    let mut timer = tokio::time::interval(Duration::from_secs(3));
    timer.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        if *stop.borrow() {
            break;
        }
        let settings = desired.borrow_and_update().clone();
        if settings.enabled {
            let found = tauri::async_runtime::spawn_blocking(windows::networks)
                .await
                .unwrap_or_else(|_| Err("Réseaux Windows indisponibles.".into()));
            let (networks, error) = match found {
                Ok(n) => (n, None),
                Err(e) => (vec![], Some(e)),
            };
            let network = networks
                .iter()
                .find(|n| settings.interface.as_ref().is_none_or(|id| id == &n.id));
            let target = network.map(|n| (n.address.clone(), settings.name.clone()));
            if active != target {
                if let Some(old) = server.take() {
                    old.stop().await;
                }
                active = None;
                if let Some(hub) = state.hub.lock().unwrap().as_ref() {
                    hub.cancel_pairing();
                };
            }
            {
                let mut status = state.status.lock().unwrap();
                status.networks = networks.clone();
                status.error = error.or_else(|| {
                    target.is_none().then(|| String::from(
                        "Aucun réseau privé IPv4 disponible. Vérifiez le profil réseau Windows et votre connexion Wi-Fi/Ethernet."
                    ))
                });
            }
            if let Some((ip, name)) = target {
                if server.is_none() {
                    if state.hub.lock().unwrap().is_none() {
                        let path = app
                            .path()
                            .app_data_dir()
                            .map(|p| p.join("apple-remote/identity.dpapi"));
                        let loaded = match path {
                            Ok(path) => tauri::async_runtime::spawn_blocking(move || {
                                windows::identity(&path)
                                    .map(|identity| (identity, windows::persistence(path)))
                            })
                            .await
                            .ok()
                            .and_then(Result::ok),
                            Err(_) => None,
                        };
                        match loaded {
                            Some((identity, persist)) => {
                                if let Ok(hub) = Hub::new(identity, persist, action_sink(app.clone())) {
                                    *state.hub.lock().unwrap() = Some(hub);
                                }
                            }
                            None => state.status.lock().unwrap().error = Some(String::from(
                                "Impossible de lire ou protéger les associations Windows. Elles n’ont pas été remplacées. Consultez le diagnostic."
                            )),
                        }
                    }
                    let hub = state.hub.lock().unwrap().clone();
                    if let Some(hub) = hub {
                        let bind_started = std::time::Instant::now();
                        match Server::bind(
                            ip.parse().expect("Windows IPv4"),
                            name.clone(),
                            hub,
                            true,
                        )
                        .await
                        {
                            Ok(new) => {
                                log::info!(
                                    "apple_remote_bind_ms={}",
                                    bind_started.elapsed().as_millis()
                                );
                                active = Some((ip, name));
                                server = Some(new);
                                state.status.lock().unwrap().error = None;
                            }
                            Err(error) => {
                                state.status.lock().unwrap().error = Some(error.to_string())
                            }
                        }
                    }
                }
            }
        } else {
            if let Some(old) = server.take() {
                old.stop().await;
            }
            active = None;
            if let Some(hub) = state.hub.lock().unwrap().as_ref() {
                hub.cancel_pairing();
            }
            let mut status = state.status.lock().unwrap();
            status.error = None;
            status.networks.clear();
        }
        if let Some(error) = server.as_ref().and_then(Server::health_error) {
            if let Some(failed) = server.take() {
                failed.stop().await;
            }
            active = None;
            state.status.lock().unwrap().error = Some(error);
        }
        {
            let mut status = state.status.lock().unwrap();
            status.running = server.is_some();
            status.address = server.as_ref().map(|s| s.address.to_string());
        }
        let _ = app.emit("apple-remote-status", state.snapshot());
        tokio::select! {_=stop.changed()=>break,_=desired.changed()=>{},_=timer.tick()=>{}}
    }
    if let Some(server) = server {
        server.stop().await;
    }
    state.hub.lock().unwrap().take();
}

#[cfg(windows)]
fn action_sink(app: tauri::AppHandle) -> crate::apple_remote::ActionSink {
    use crate::apple_remote::Action;
    let (tx, rx) = std::sync::mpsc::sync_channel::<Action>(64);
    let overflow = Arc::new(AtomicBool::new(false));
    let overflowed = overflow.clone();
    std::thread::spawn(move || {
        let mut accepts = std::collections::BTreeSet::new();
        let mut external = std::collections::BTreeMap::new();
        while let Ok(event) = rx.recv() {
            if overflowed.swap(false, Ordering::SeqCst) {
                accepts.clear();
                external.clear();
                let _ = app.emit(
                    "apple-input",
                    serde_json::json!({"action":"accept-cancel","connection":0}),
                );
                continue;
            }
            let state = app.state::<AppleRemoteState>();
            let authorized = state.desired.borrow().enabled
                && state
                    .hub
                    .lock()
                    .unwrap()
                    .as_ref()
                    .is_some_and(|hub| hub.connection_allowed(event.connection));
            if event.pressed && !authorized {
                continue;
            }
            if !event.pressed {
                let action = if event.action == "accept-cancel" {
                    "accept"
                } else {
                    event.action
                };
                external.remove(&(event.connection, action));
            }
            let focused = authorized
                && app
                    .get_webview_window("main")
                    .is_some_and(|w| w.is_focused().unwrap_or(false));
            let result = match event.action {
                "home" if event.pressed => {
                    let handle = app.clone();
                    let _ = app.run_on_main_thread(move || crate::runtime::show_home(&handle));
                    Ok(())
                }
                "volumeUp" | "volumeDown" | "playPause" | "previousTrack" | "nextTrack"
                    if event.pressed =>
                {
                    crate::platform::media_command(event.action)
                }
                "accept-cancel" => {
                    accepts.remove(&event.connection);
                    let _ = app.emit(
                        "apple-input",
                        serde_json::json!({"action":"accept-cancel","connection":event.connection}),
                    );
                    Ok(())
                }
                "accept" => {
                    if event.pressed {
                        if focused {
                            accepts.insert(event.connection);
                            let _=app.emit("apple-input",serde_json::json!({"action":"accept-down","connection":event.connection}));
                            Ok(())
                        } else {
                            crate::platform::remote_navigation_press("accept").map(|press| {
                                external.insert((event.connection, "accept"), press);
                            })
                        }
                    } else {
                        if accepts.remove(&event.connection) {
                            let _=app.emit("apple-input",serde_json::json!({"action":if focused{"accept-up"}else{"accept-cancel"},"connection":event.connection}));
                        }
                        Ok(())
                    }
                }
                "up" | "down" | "left" | "right" | "back" if event.pressed => {
                    if focused {
                        let _=app.emit("apple-input",serde_json::json!({"action":event.action,"connection":event.connection}));
                        Ok(())
                    } else {
                        crate::platform::remote_navigation_press(event.action).map(|press| {
                            external.insert((event.connection, event.action), press);
                        })
                    }
                }
                _ => Ok(()),
            };
            if let Err(error) = result {
                let _ = app.emit("native-error", error);
            }
        }
    });
    Arc::new(move |action| {
        if tx.try_send(action).is_err() {
            overflow.store(true, Ordering::SeqCst);
        }
    })
}
