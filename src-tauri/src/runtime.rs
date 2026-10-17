use crate::{
    config::ConfigStore,
    model::{AppEntry, Config, Target, TargetKind},
    platform,
    tracking::{Session, SessionView},
};
use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager, PhysicalPosition, PhysicalSize};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_updater::UpdaterExt;

pub struct State {
    pub config: Mutex<Config>,
    config_save: Mutex<()>,
    pub controller: Mutex<Option<String>>,
    pub controller_test: AtomicBool,
    store: ConfigStore,
    sessions: Mutex<HashMap<String, Session>>,
    launching: Mutex<HashSet<String>>,
    warning: Mutex<Option<String>>,
    started: Instant,
    ready: AtomicBool,
    painted: AtomicBool,
    tray_scheduled: AtomicBool,
    returning: Mutex<Option<Instant>>,
    updating: AtomicBool,
    scan_busy: AtomicBool,
    update: Mutex<Option<tauri_plugin_updater::Update>>,
    active: Mutex<Option<String>>,
}
fn now(state: &State) -> u64 {
    state.started.elapsed().as_millis() as u64
}
fn session_views(state: &State) -> Vec<SessionView> {
    let t = now(state);
    let mut v: Vec<_> = state
        .sessions
        .lock()
        .unwrap()
        .values()
        .map(|s| s.view(t))
        .collect();
    v.sort_by(|a, b| a.app_id.cmp(&b.app_id));
    v
}
fn emit_sessions(app: &tauri::AppHandle) {
    let _ = app.emit("sessions", session_views(&app.state::<State>()));
}
fn foreground(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
        #[cfg(windows)]
        if let Ok(h) = w.hwnd() {
            if !platform::focus(h.0 as isize) {
                let _ = app.emit(
                    "native-error",
                    "Sélectionnez Canapey dans la barre des tâches (Windows a conservé le focus). ",
                );
            }
        }
    }
}
pub fn show_home(app: &tauri::AppHandle) {
    let started = Instant::now();
    if let Some(state) = app.try_state::<State>() {
        state.controller_test.store(false, Ordering::SeqCst);
        let _ = app.emit("controller-test-ended", ());
        *state.returning.lock().unwrap() = Some(Instant::now());
        let config = state.config.lock().unwrap().clone();
        let _ = apply_display(app, &config);
    }
    foreground(app);
    let _ = app.emit("home", ());
    log::info!("return_window_request_ms={}", started.elapsed().as_millis());
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Boot {
    config: Config,
    warning: Option<String>,
    version: String,
    native: bool,
    sessions: Vec<SessionView>,
    controller: Option<String>,
}
#[tauri::command]
fn bootstrap(app: tauri::AppHandle, state: tauri::State<State>) -> Boot {
    state.controller_test.store(false, Ordering::SeqCst);
    Boot {
        config: state.config.lock().unwrap().clone(),
        warning: state.warning.lock().unwrap().take(),
        version: app.package_info().version.to_string(),
        native: cfg!(windows),
        sessions: session_views(&state),
        controller: state.controller.lock().unwrap().clone(),
    }
}
#[tauri::command]
fn set_controller_test(state: tauri::State<State>, enabled: bool) -> Result<(), String> {
    platform::supported()?;
    state.controller_test.store(enabled, Ordering::SeqCst);
    Ok(())
}
#[tauri::command]
fn frontend_ready(app: tauri::AppHandle, state: tauri::State<State>, frontend_ms: f64) {
    if !state.ready.swap(true, Ordering::SeqCst) {
        foreground(&app);
        log::info!(
            "frontend_loaded_ms={} frontend_ms={frontend_ms:.1}",
            state.started.elapsed().as_millis()
        );
    }
}
#[tauri::command]
fn frontend_painted(app: tauri::AppHandle, state: tauri::State<State>, timings: FrontendTimings) {
    if !state.painted.swap(true, Ordering::SeqCst) {
        log::info!(
            "startup_interactive_ms={}",
            state.started.elapsed().as_millis()
        );
        log::info!(
            "startup_frontend_timings={}",
            serde_json::to_string(&timings).unwrap_or_default()
        );
        schedule_tray(&app);
    }
}
#[derive(serde::Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct FrontendTimings {
    entry: Option<f64>,
    mounted: Option<f64>,
    bootstrap_start: Option<f64>,
    bootstrap_end: Option<f64>,
    subscribe_start: Option<f64>,
    subscribe_end: Option<f64>,
    focused: Option<f64>,
    painted: Option<f64>,
}
#[tauri::command]
fn home_ready(state: tauri::State<State>) {
    if let Some(start) = state.returning.lock().unwrap().take() {
        log::info!("return_interactive_ms={}", start.elapsed().as_millis());
    }
}
fn validate_images(config: &Config, dir: &std::path::Path) -> Result<(), String> {
    for a in &config.apps {
        for path in [&a.card, &a.background, &a.icon].into_iter().flatten() {
            let p = std::fs::canonicalize(path)
                .map_err(|_| "Image locale introuvable. Choisissez-la de nouveau.")?;
            let allowed = [dir.join("art"), dir.join("icons")]
                .iter()
                .filter_map(|p| p.canonicalize().ok())
                .any(|root| p.starts_with(root));
            if !allowed {
                return Err("Image hors du dossier de Canapey.".into());
            }
        }
    }
    Ok(())
}
#[tauri::command]
async fn save_config(
    app: tauri::AppHandle,
    state: tauri::State<'_, State>,
    mut config: Config,
    remote_home_update: Option<bool>,
) -> Result<Config, String> {
    config.settings.migrate_remote();
    config.validate()?;
    validate_images(&config, &state.store.dir)?;
    // Native shortcut registration dispatches to the UI thread. Never hold the
    // configuration read lock while waiting for it (Home also reads config).
    let _saving = state.config_save.lock().unwrap();
    let current = state.config.lock().unwrap().clone();
    if cfg!(windows) && config.settings.autostart != current.settings.autostart {
        let manager = app.autolaunch();
        let result = if config.settings.autostart {
            manager.enable()
        } else {
            manager.disable()
        };
        result.map_err(|e| format!("Démarrage Windows : {e}"))?;
    }
    let save_result = if remote_home_update == Some(true)
        || config.settings.remote_bindings != current.settings.remote_bindings
    {
        crate::remote_home::save_with_binding(&app, &config.settings.remote_bindings, || {
            state.store.save(&config)
        })
    } else {
        state.store.save(&config)
    };
    if let Err(e) = save_result {
        if cfg!(windows) && config.settings.autostart != current.settings.autostart {
            let manager = app.autolaunch();
            let _ = if current.settings.autostart {
                manager.enable()
            } else {
                manager.disable()
            };
        }
        return Err(e);
    }
    let display_changed = config.settings.monitor != current.settings.monitor
        || config.settings.fullscreen != current.settings.fullscreen;
    *state.config.lock().unwrap() = config.clone();
    if display_changed {
        if let Err(error) = apply_display(&app, &config) {
            log::warn!("Display settings: {error}");
            let _=app.emit("native-error","Réglages enregistrés. Windows n’a pas pu changer l’affichage ; réessayez depuis les paramètres.");
        }
    }
    Ok(config)
}
#[derive(Serialize)]
struct Monitor {
    id: String,
    name: String,
    primary: bool,
}
#[tauri::command]
fn list_monitors(app: tauri::AppHandle) -> Result<Vec<Monitor>, String> {
    let w = app.get_webview_window("main").ok_or("Fenêtre absente")?;
    let primary = w
        .primary_monitor()
        .map_err(|e| e.to_string())?
        .and_then(|m| m.name().cloned());
    Ok(w.available_monitors()
        .map_err(|e| e.to_string())?
        .iter()
        .map(|m| Monitor {
            id: m.name().cloned().unwrap_or_default(),
            name: format!(
                "{} · {} × {}",
                m.name().cloned().unwrap_or_else(|| "Écran".into()),
                m.size().width,
                m.size().height
            ),
            primary: m.name() == primary.as_ref(),
        })
        .collect())
}
fn apply_display(app: &tauri::AppHandle, config: &Config) -> Result<(), String> {
    let w = app.get_webview_window("main").ok_or("Fenêtre absente")?;
    let monitors = w.available_monitors().map_err(|e| e.to_string())?;
    let monitor = monitors
        .iter()
        .find(|m| m.name() == config.settings.monitor.as_ref())
        .cloned()
        .or(w.primary_monitor().map_err(|e| e.to_string())?)
        .or_else(|| monitors.first().cloned());
    if let Some(m) = monitor {
        let current = w.current_monitor().ok().flatten();
        let different = current
            .as_ref()
            .is_none_or(|c| c.position() != m.position() || c.size() != m.size());
        if different {
            let _ = w.set_fullscreen(false);
            w.set_position(PhysicalPosition::new(m.position().x, m.position().y))
                .map_err(|e| e.to_string())?;
            if config.settings.fullscreen {
                let _ = w.set_size(PhysicalSize::new(m.size().width, m.size().height));
            }
        }
    }
    w.set_decorations(!config.settings.fullscreen)
        .map_err(|e| e.to_string())?;
    w.set_fullscreen(config.settings.fullscreen)
        .map_err(|e| e.to_string())
}
#[tauri::command]
async fn scan_apps(app: tauri::AppHandle) -> Result<Vec<AppEntry>, String> {
    let state = app.state::<State>();
    if state.scan_busy.swap(true, Ordering::SeqCst) {
        return Err("Détection déjà en cours.".into());
    }
    let dir = state.store.dir.join("icons");
    let protected: HashSet<PathBuf> = state
        .config
        .lock()
        .unwrap()
        .apps
        .iter()
        .filter_map(|a| a.icon.as_ref().map(PathBuf::from))
        .collect();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let mut entries = platform::scan(&dir, None)?;
        prune_icons(&dir, &protected);
        for entry in &mut entries {
            if entry
                .icon
                .as_ref()
                .is_some_and(|p| !std::path::Path::new(p).is_file())
            {
                entry.icon = None;
            }
        }
        Ok::<_, String>(entries)
    })
    .await;
    state.scan_busy.store(false, Ordering::SeqCst);
    result.map_err(|e| e.to_string())?
}
#[tauri::command]
async fn pick_application(app: tauri::AppHandle) -> Result<Option<AppEntry>, String> {
    platform::supported()?;
    let window = app.get_webview_window("main").ok_or("Fenêtre absente")?;
    let Some(file) = rfd::AsyncFileDialog::new()
        .set_parent(&window)
        .add_filter("Applications Windows", &["exe", "lnk"])
        .pick_file()
        .await
    else {
        return Ok(None);
    };
    let path = file.path().to_path_buf();
    let dir = app.state::<State>().store.dir.join("icons");
    if path
        .extension()
        .is_some_and(|s| s.eq_ignore_ascii_case("lnk"))
    {
        return tauri::async_runtime::spawn_blocking(move || {
            platform::scan(&dir, Some(&path)).map(|mut a| a.pop())
        })
        .await
        .map_err(|e| e.to_string())?;
    }
    let name = path
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    Ok(Some(AppEntry {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        target: Target {
            kind: TargetKind::Executable,
            value: path.to_string_lossy().into_owned(),
            args: vec![],
            working_dir: path.parent().map(|p| p.to_string_lossy().into_owned()),
        },
        theme: "home".into(),
        card: None,
        background: None,
        icon: None,
        source: "Ajout manuel".into(),
    }))
}
#[tauri::command]
async fn pick_image(app: tauri::AppHandle, kind: String) -> Result<Option<String>, String> {
    if !["card", "background"].contains(&kind.as_str()) {
        return Err("Type d’image inconnu.".into());
    }
    let window = app.get_webview_window("main").ok_or("Fenêtre absente")?;
    let Some(file) = rfd::AsyncFileDialog::new()
        .set_parent(&window)
        .add_filter("Images", &["png", "jpg", "jpeg", "webp"])
        .pick_file()
        .await
    else {
        return Ok(None);
    };
    let dir = app.state::<State>().store.dir.join("art");
    let path = file.path().to_path_buf();
    tauri::async_runtime::spawn_blocking(move||{
        std::fs::create_dir_all(&dir).map_err(|e|e.to_string())?;
        let used:u64=std::fs::read_dir(&dir).map_err(|e|e.to_string())?.filter_map(Result::ok).filter_map(|e|e.metadata().ok()).map(|m|m.len()).sum();
        if used>128*1024*1024{return Err("Limite des visuels atteinte (128 Mo). Nettoyez les images inutilisées depuis le dossier de données.".into())}
        if std::fs::metadata(&path).map_err(|e|e.to_string())?.len()>20*1024*1024{return Err("Image trop volumineuse (20 Mo maximum).".into())}
        let mut reader=image::ImageReader::open(path).map_err(|e|e.to_string())?.with_guessed_format().map_err(|e|e.to_string())?;
        let mut limits=image::Limits::default();limits.max_image_width=Some(8192);limits.max_image_height=Some(8192);limits.max_alloc=Some(128*1024*1024);reader.limits(limits);
        let img=reader.decode().map_err(|_|"Image illisible ou trop grande.")?;
        let (w,h)=if kind=="card"{(640,360)}else{(1920,1080)};
        let output=dir.join(format!("{}.webp",uuid::Uuid::new_v4()));
        img.resize_to_fill(w,h,image::imageops::FilterType::Lanczos3).save(&output).map_err(|e|e.to_string())?;Ok(Some(output.to_string_lossy().into_owned()))
    }).await.map_err(|e|e.to_string())?
}
fn browser_target(a: &AppEntry) -> bool {
    let p = a.target.value.to_lowercase();
    [
        "chrome.exe",
        "msedge.exe",
        "firefox.exe",
        "brave.exe",
        "opera.exe",
        "iexplore.exe",
    ]
    .iter()
    .any(|b| p.ends_with(b))
}
#[tauri::command]
async fn launch_app(app: tauri::AppHandle, id: String) -> Result<SessionView, String> {
    platform::supported()?;
    let state = app.state::<State>();
    if state.sessions.lock().unwrap().contains_key(&id) {
        resume_app(app.clone(), id.clone())?;
        return Ok(state
            .sessions
            .lock()
            .unwrap()
            .get(&id)
            .ok_or("Cette application vient de se fermer.")?
            .view(now(&state)));
    }
    {
        let mut launching = state.launching.lock().unwrap();
        if state.updating.load(Ordering::SeqCst) {
            return Err("Installation d’une mise à jour en cours.".into());
        }
        if !launching.insert(id.clone()) {
            return Err("Lancement en cours.".into());
        }
    }
    let item = state
        .config
        .lock()
        .unwrap()
        .apps
        .iter()
        .find(|a| a.id == id)
        .cloned();
    let result = if let Some(item) = item {
        let cloned = app.clone();
        tauri::async_runtime::spawn_blocking(move || launch_tracked(&cloned, item))
            .await
            .map_err(|e| e.to_string())
            .and_then(|r| r)
    } else {
        Err("Application introuvable.".into())
    };
    state.launching.lock().unwrap().remove(&id);
    if result.is_ok() {
        *state.active.lock().unwrap() = Some(id);
        emit_sessions(&app);
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.minimize();
        }
    }
    result
}
fn launch_tracked(app: &tauri::AppHandle, item: AppEntry) -> Result<SessionView, String> {
    let state = app.state::<State>();
    let (before, windows) = platform::snapshot();
    let path = if item.target.kind == TargetKind::Executable && !browser_target(&item) {
        Some(item.target.value.clone())
    } else {
        None
    };
    let existing = path.as_ref().and_then(|p| {
        before.iter().find(|process| {
            process.path.eq_ignore_ascii_case(p) && windows.iter().any(|w| w.process == process.key)
        })
    });
    let key = if let Some(p) = existing {
        Some(p.key)
    } else {
        platform::launch(&item)?
    };
    let known = key.into_iter().collect();
    let baseline: HashSet<_> = before.iter().map(|p| p.key).collect();
    let owned = key.filter(|k| !baseline.contains(k)).into_iter().collect();
    let t = now(&state);
    let mut session = Session {
        app_id: item.id.clone(),
        name: item.name,
        known,
        owned,
        windows: vec![],
        maximized_windows: HashSet::new(),
        baseline,
        expected_path: path,
        launched_at: t,
        last_seen: t,
        seen_window: false,
        untracked: item.target.kind == TargetKind::Uri || browser_target_value(&item.target.value),
        closing_at: None,
    };
    session.update(&before, &windows, t);
    session.maximize_new_windows(platform::maximize);
    if existing.is_some() {
        for w in &session.windows {
            platform::focus_app(w);
        }
    }
    let view = session.view(t);
    state.sessions.lock().unwrap().insert(item.id, session);
    Ok(view)
}
fn browser_target_value(value: &str) -> bool {
    let p = value.to_lowercase();
    [
        "chrome.exe",
        "msedge.exe",
        "firefox.exe",
        "brave.exe",
        "opera.exe",
    ]
    .iter()
    .any(|b| p.ends_with(b))
}
#[tauri::command]
fn resume_app(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let state = app.state::<State>();
    let sessions = state.sessions.lock().unwrap();
    let session = sessions.get(&id).ok_or("Application non suivie.")?;
    if session.untracked {
        return Err(
            "Fenêtre partagée ou non identifiable : utilisez Alt+Tab pour la reprendre.".into(),
        );
    }
    let (_, windows) = platform::snapshot();
    let valid = session
        .windows
        .iter()
        .find(|w| {
            windows
                .iter()
                .any(|live| live.handle == w.handle && live.process == w.process)
        })
        .ok_or("La fenêtre n’est pas encore disponible.")?;
    // Check all associated windows: the first in Z-order may be a dialog.
    for window in &session.windows {
        platform::maximize(window);
    }
    if !platform::focus_app(valid) {
        return Err(
            "Windows a gardé le focus. Sélectionnez l’application dans la barre des tâches.".into(),
        );
    }
    *state.active.lock().unwrap() = Some(id);
    Ok(())
}
#[tauri::command]
fn close_app(app: tauri::AppHandle, id: String, force: bool) -> Result<(), String> {
    let state = app.state::<State>();
    let mut sessions = state.sessions.lock().unwrap();
    let session = sessions.get_mut(&id).ok_or("Application non suivie.")?;
    if session.untracked {
        if force {
            return Err("Fermeture forcée interdite pour une fenêtre partagée.".into());
        }
        sessions.remove(&id);
        drop(sessions);
        emit_sessions(&app);
        return Ok(());
    }
    if force {
        if !session.view(now(&state)).can_force {
            return Err("Demandez d’abord une fermeture normale et attendez 5 secondes.".into());
        }
        for key in &session.owned {
            platform::terminate(*key)?;
        }
    } else {
        if session.windows.is_empty() {
            return Err("Aucune fenêtre à fermer. Attendez la fin du lancement.".into());
        }
        for window in &session.windows {
            platform::close(window)?;
        }
        session.closing_at = Some(now(&state));
    }
    drop(sessions);
    emit_sessions(&app);
    Ok(())
}
#[tauri::command]
fn show_desktop(app: tauri::AppHandle) -> Result<(), String> {
    platform::desktop()?;
    if let Some(w) = app.get_webview_window("main") {
        w.minimize().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn audio_state() -> Result<crate::audio::AudioState, String> {
    tauri::async_runtime::spawn_blocking(platform::audio_state)
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn change_audio(
    change: crate::audio::AudioChange,
) -> Result<crate::audio::AudioState, String> {
    change.validate()?;
    tauri::async_runtime::spawn_blocking(move || platform::change_audio(change))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn run_remote_action(app: tauri::AppHandle, button: String) -> Result<(), String> {
    let binding = app
        .state::<State>()
        .config
        .lock()
        .unwrap()
        .settings
        .remote_bindings
        .iter()
        .find(|b| b.button == button)
        .cloned()
        .ok_or("Bouton non associé.")?;
    execute_remote(app, binding).await
}
async fn execute_remote(
    app: tauri::AppHandle,
    binding: crate::remote_shortcut::RemoteBinding,
) -> Result<(), String> {
    match binding.action.as_str() {
        "home" => {
            show_home(&app);
            Ok(())
        }
        "launch" => launch_app(app, binding.app_id.ok_or("Application non choisie.")?)
            .await
            .map(|_| ()),
        "desktop" => show_desktop(app),
        "volumeUp" | "volumeDown" | "mute" | "playPause" | "previousTrack" | "nextTrack"
        | "stop" => platform::media_command(&binding.action),
        _ => Err("Cette action se déclenche depuis l’interface Canapey.".into()),
    }
}
#[cfg(windows)]
pub(crate) fn dispatch_remote(
    app: tauri::AppHandle,
    binding: crate::remote_shortcut::RemoteBinding,
) {
    tauri::async_runtime::spawn(async move {
        if let Err(error) = execute_remote(app.clone(), binding).await {
            let _ = app.emit("native-error", error);
        }
    });
}

#[tauri::command]
fn power_action(action: String) -> Result<(), String> {
    platform::power(&action)
}
#[tauri::command]
fn quit(app: tauri::AppHandle) {
    app.exit(0);
}
#[tauri::command]
fn open_logs(app: tauri::AppHandle) -> Result<(), String> {
    let dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    #[cfg(windows)]
    {
        let exe = std::path::PathBuf::from(
            std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into()),
        )
        .join("explorer.exe");
        std::process::Command::new(exe)
            .arg(&dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))]
    {
        return Err(format!("Logs : {}", dir.display()));
    }
    #[allow(unreachable_code)]
    Ok(())
}
#[derive(Serialize)]
struct UpdateInfo {
    state: &'static str,
    version: Option<String>,
    notes: Option<String>,
}
#[tauri::command]
async fn check_update(app: tauri::AppHandle) -> Result<UpdateInfo, String> {
    let state = app.state::<State>();
    let configured = app.config().plugins.0.get("updater").is_some_and(|c| {
        c.get("pubkey")
            .and_then(|v| v.as_str())
            .is_some_and(|s| !s.is_empty())
            && c.get("endpoints")
                .and_then(|v| v.as_array())
                .is_some_and(|v| !v.is_empty())
    });
    if !configured {
        return Ok(UpdateInfo {
            state: "disabled",
            version: None,
            notes: None,
        });
    }
    if !state.sessions.lock().unwrap().is_empty() {
        return Err("Fermez les applications suivies avant de rechercher une mise à jour.".into());
    }
    let update = app
        .updater_builder()
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| {
            log::warn!("Updater check: {e}");
            "Mises à jour indisponibles. Vérifiez votre connexion et réessayez.".to_owned()
        })?;
    let info = if let Some(u) = &update {
        UpdateInfo {
            state: "available",
            version: Some(u.version.clone()),
            notes: u.body.clone(),
        }
    } else {
        UpdateInfo {
            state: "current",
            version: None,
            notes: None,
        }
    };
    *state.update.lock().unwrap() = update;
    Ok(info)
}
#[tauri::command]
async fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<State>();
    {
        let launching = state.launching.lock().unwrap();
        if !launching.is_empty() || !state.sessions.lock().unwrap().is_empty() {
            return Err("Fermez les applications suivies avant d’installer.".into());
        }
        if state.updating.swap(true, Ordering::SeqCst) {
            return Err("Installation déjà en cours.".into());
        }
    }
    let update = state.update.lock().unwrap().take();
    let result = if let Some(u) = update {
        u.download_and_install(|_, _| {}, || {}).await.map_err(|e| {
            log::error!("Updater install: {e}");
            "Installation impossible. Vos réglages sont conservés.".to_owned()
        })
    } else {
        Err("Recherchez d’abord une mise à jour.".into())
    };
    state.updating.store(false, Ordering::SeqCst);
    if result.is_ok() {
        app.restart();
    }
    result
}
fn start_tracking(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut last = String::new();
        let mut display = String::new();
        let mut tick = 0u32;
        loop {
            std::thread::sleep(Duration::from_millis(350));
            let state = app.state::<State>();
            if !state.sessions.lock().unwrap().is_empty() {
                let (processes, windows) = platform::snapshot();
                let time = now(&state);
                let mut sessions = state.sessions.lock().unwrap();
                let mut ended = Vec::new();
                for (id, s) in sessions.iter_mut() {
                    if s.update(&processes, &windows, time) {
                        ended.push(id.clone());
                    } else {
                        s.maximize_new_windows(platform::maximize);
                    }
                }
                let active = state.active.lock().unwrap().clone();
                let return_home = active.as_ref().is_some_and(|id| ended.contains(id));
                for id in ended {
                    sessions.remove(&id);
                }
                drop(sessions);
                if return_home {
                    *state.active.lock().unwrap() = None;
                    show_home(&app);
                }
            }
            let views = session_views(&state);
            let serialized = serde_json::to_string(&views).unwrap_or_default();
            if serialized != last {
                let _ = app.emit("sessions", &views);
                last = serialized;
            }
            tick += 1;
            if tick.is_multiple_of(6) {
                if let Some(w) = app.get_webview_window("main") {
                    let fingerprint = format!("{:?}", w.available_monitors().ok());
                    if fingerprint != display {
                        display = fingerprint;
                        let c = state.config.lock().unwrap().clone();
                        let _ = apply_display(&app, &c);
                    }
                }
            }
        }
    });
}
fn prune_icons(dir: &std::path::Path, protected: &HashSet<PathBuf>) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        let mut files: Vec<_> = entries
            .filter_map(Result::ok)
            .filter_map(|e| {
                e.metadata()
                    .ok()
                    .map(|m| (e.path(), m.len(), m.modified().ok()))
            })
            .collect();
        files.sort_by_key(|f| f.2);
        let mut size: u64 = files.iter().map(|f| f.1).sum();
        for (path, len, _) in files {
            if size <= 64 * 1024 * 1024 {
                break;
            }
            if !protected.contains(&path) && std::fs::remove_file(path).is_ok() {
                size = size.saturating_sub(len)
            }
        }
    }
}
// Creating the tray is not required for the first interactive home screen.
// The watchdog also schedules it if the frontend cannot reach its painted signal.
fn schedule_tray(app: &tauri::AppHandle) {
    let state = app.state::<State>();
    if state.tray_scheduled.swap(true, Ordering::SeqCst) {
        return;
    }
    let handle = app.clone();
    if let Err(error) = app.run_on_main_thread(move || {
        let started = Instant::now();
        if let Err(error) = create_tray(&handle) {
            log::warn!("Unable to create tray: {error}");
        }
        log::info!("startup_deferred_tray_ms={}", started.elapsed().as_millis());
    }) {
        state.tray_scheduled.store(false, Ordering::SeqCst);
        log::warn!("Unable to schedule tray: {error}");
    }
}
fn create_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    use tauri::{
        menu::{Menu, MenuItem},
        tray::TrayIconBuilder,
    };
    let open = MenuItem::with_id(app, "open", "Ouvrir Canapey", true, None::<&str>)?;
    let exit = MenuItem::with_id(app, "exit", "Quitter", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &exit])?;
    let mut tray = TrayIconBuilder::new()
        .tooltip("Canapey Launcher")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_home(app),
            "exit" => app.exit(0),
            _ => {}
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}
pub fn run() {
    let started = Instant::now();
    let builder = tauri::Builder::default();
    #[cfg(windows)]
    let builder = builder.plugin(crate::remote_home::plugin());
    builder
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            show_home(app)
        }))
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .max_file_size(2_000_000)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(3))
                .build(),
        )
        .setup(move |app| {
            let setup_started = Instant::now();
            log::info!(
                "startup_begin version={} os={} arch={} profile={} pid={} setup_enter_ms={}",
                app.package_info().version,
                std::env::consts::OS,
                std::env::consts::ARCH,
                if cfg!(debug_assertions) {
                    "debug"
                } else {
                    "release"
                },
                std::process::id(),
                started.elapsed().as_millis()
            );
            let config_started = Instant::now();
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let store = ConfigStore::new(dir.clone());
            let (mut config, mut warning) = store.load();
            if let Err(e) = platform::supported() {
                warning = Some(e);
            }
            if cfg!(windows) {
                if let Ok(enabled) = app.autolaunch().is_enabled() {
                    config.settings.autostart = enabled;
                }
            }
            log::info!("startup_config_ms={}", config_started.elapsed().as_millis());
            let artwork_started = Instant::now();
            // Missing artwork should not prevent startup or the next settings save.
            for item in &mut config.apps {
                for p in [&mut item.card, &mut item.background, &mut item.icon] {
                    if p.as_ref()
                        .is_some_and(|p| !std::path::Path::new(p).is_file())
                    {
                        *p = None;
                    }
                }
            }
            log::info!(
                "startup_artwork_check_ms={} apps={}",
                artwork_started.elapsed().as_millis(),
                config.apps.len()
            );
            app.manage(State {
                config: Mutex::new(config.clone()),
                config_save: Mutex::new(()),
                store,
                controller: Mutex::new(None),
                controller_test: AtomicBool::new(false),
                sessions: Mutex::new(HashMap::new()),
                launching: Mutex::new(HashSet::new()),
                warning: Mutex::new(warning),
                started,
                ready: AtomicBool::new(false),
                painted: AtomicBool::new(false),
                tray_scheduled: AtomicBool::new(false),
                returning: Mutex::new(None),
                updating: AtomicBool::new(false),
                scan_busy: AtomicBool::new(false),
                update: Mutex::new(None),
                active: Mutex::new(None),
            });
            app.manage(crate::xbox_home::XboxHomeState::default());
            app.manage(crate::remote_home::RemoteHomeState::default());
            crate::remote_home::start(app.handle(), &config.settings.remote_bindings);
            let display_started = Instant::now();
            let _ = apply_display(app.handle(), &config);
            log::info!(
                "startup_display_ms={}",
                display_started.elapsed().as_millis()
            );
            let a = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(3));
                if !a.state::<State>().ready.load(Ordering::SeqCst) {
                    log::warn!(
                        "startup_show_watchdog_ms={}",
                        a.state::<State>().started.elapsed().as_millis()
                    );
                    foreground(&a);
                }
                schedule_tray(&a);
            });
            platform::start_controller(app.handle().clone());
            crate::xbox_home::start(app.handle().clone());
            start_tracking(app.handle().clone());
            let maintenance = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(10));
                let protected = maintenance
                    .state::<State>()
                    .config
                    .lock()
                    .unwrap()
                    .apps
                    .iter()
                    .filter_map(|a| a.icon.as_ref().map(PathBuf::from))
                    .collect();
                prune_icons(&dir.join("icons"), &protected);
            });
            log::info!(
                "startup_setup_ms={} startup_setup_complete_ms={}",
                setup_started.elapsed().as_millis(),
                started.elapsed().as_millis()
            );
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            run_remote_action,
            crate::remote_home::remote_home_status,
            crate::remote_home::set_remote_capture,
            crate::xbox_home::xbox_home_status,
            crate::xbox_home::test_xbox_button,
            crate::xbox_home::cancel_xbox_test,
            crate::xbox_home::open_game_bar_settings,
            bootstrap,
            set_controller_test,
            frontend_ready,
            home_ready,
            frontend_painted,
            save_config,
            list_monitors,
            scan_apps,
            pick_application,
            pick_image,
            launch_app,
            resume_app,
            close_app,
            show_desktop,
            power_action,
            audio_state,
            change_audio,
            quit,
            open_logs,
            check_update,
            install_update
        ])
        .run(tauri::generate_context!())
        .expect("Impossible de démarrer Canapey Launcher");
}
