use crate::tv::{self, Client, PairedTv, PendingPair, Television};
use serde::Serialize;
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager};
#[cfg(windows)]
mod windows;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TvStatus {
    available: bool,
    tv: Option<Television>,
    auto_wake: bool,
    auto_standby: bool,
    waking: bool,
    resume_available: bool,
    message: Option<String>,
    error: Option<String>,
}
pub struct TvState {
    path: PathBuf,
    paired: Mutex<Option<PairedTv>>,
    pending: Mutex<Option<PendingPair>>,
    operation: tokio::sync::Mutex<()>,
    generation: AtomicU64,
    waking: AtomicBool,
    stopped: AtomicBool,
    resume_available: AtomicBool,
    last_auto: Mutex<Option<Instant>>,
    sleeping: AtomicBool,
    power_epoch: AtomicU64,
    power_changed: tokio::sync::Notify,
    message: Mutex<Option<String>>,
    error: Mutex<Option<String>>,
}
impl TvState {
    pub fn new(path: PathBuf) -> Self {
        #[cfg(windows)]
        let loaded = windows::load(&path);
        #[cfg(not(windows))]
        let loaded: tv::Result<Option<PairedTv>> = Ok(None);
        let (paired, error) = match loaded {
            Ok(value) => (value, None),
            Err(e) => (None, Some(e)),
        };
        Self {
            path,
            paired: Mutex::new(paired),
            pending: Mutex::new(None),
            operation: tokio::sync::Mutex::new(()),
            generation: AtomicU64::new(0),
            waking: AtomicBool::new(false),
            stopped: AtomicBool::new(false),
            resume_available: AtomicBool::new(false),
            last_auto: Mutex::new(None),
            sleeping: AtomicBool::new(false),
            power_epoch: AtomicU64::new(0),
            power_changed: tokio::sync::Notify::new(),
            message: Mutex::new(None),
            error: Mutex::new(error),
        }
    }
    fn status(&self) -> TvStatus {
        let paired = self.paired.lock().unwrap();
        TvStatus {
            available: cfg!(windows),
            tv: paired.as_ref().map(|p| p.tv.clone()),
            auto_wake: paired.as_ref().is_some_and(|p| p.auto_wake),
            auto_standby: paired.as_ref().is_some_and(|p| p.auto_standby),
            waking: self.waking.load(Ordering::SeqCst),
            resume_available: self.resume_available.load(Ordering::SeqCst),
            message: self.message.lock().unwrap().clone(),
            error: self.error.lock().unwrap().clone(),
        }
    }
    fn save(&self, paired: &PairedTv) -> tv::Result<()> {
        paired.validate()?;
        #[cfg(windows)]
        windows::save(&self.path, paired)?;
        #[cfg(not(windows))]
        return Err("TV pairing is available on Windows.".into());
        #[cfg(windows)]
        {
            *self.paired.lock().unwrap() = Some(paired.clone());
            Ok(())
        }
    }
}
fn supported() -> tv::Result<()> {
    if cfg!(windows) {
        Ok(())
    } else {
        Err("TV pairing is available on Windows.".into())
    }
}
fn emit(app: &tauri::AppHandle) {
    let _ = app.emit("tv-status", app.state::<TvState>().status());
}
#[tauri::command]
pub fn tv_status(state: tauri::State<TvState>) -> TvStatus {
    state.status()
}
#[tauri::command]
pub async fn tv_discover(state: tauri::State<'_, TvState>) -> tv::Result<Vec<Television>> {
    supported()?;
    let _guard = state
        .operation
        .try_lock()
        .map_err(|_| "Another TV operation is in progress.")?;
    tv::discover(&Client::new()?).await
}
#[tauri::command]
pub async fn tv_inspect(state: tauri::State<'_, TvState>, ip: String) -> tv::Result<Television> {
    supported()?;
    let _guard = state
        .operation
        .try_lock()
        .map_err(|_| "Another TV operation is in progress.")?;
    Client::new()?.inspect(tv::local_ip(&ip)?).await
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairStarted {
    seconds_remaining: u64,
    name: String,
}
#[tauri::command]
pub async fn tv_pair(state: tauri::State<'_, TvState>, tv: Television) -> tv::Result<PairStarted> {
    supported()?;
    let _guard = state
        .operation
        .try_lock()
        .map_err(|_| "Another TV operation is in progress.")?;
    let generation = state.generation.fetch_add(1, Ordering::SeqCst) + 1;
    *state.pending.lock().unwrap() = None;
    let pending = Client::new()?.pair(tv).await?;
    if state.generation.load(Ordering::SeqCst) != generation {
        return Err("Pairing cancelled.".into());
    }
    let result = PairStarted {
        seconds_remaining: pending
            .expires
            .saturating_duration_since(Instant::now())
            .as_secs(),
        name: pending.tv.name.clone(),
    };
    *state.pending.lock().unwrap() = Some(pending);
    Ok(result)
}
#[tauri::command]
pub fn tv_cancel_pairing(state: tauri::State<TvState>) {
    state.generation.fetch_add(1, Ordering::SeqCst);
    *state.pending.lock().unwrap() = None;
}
#[tauri::command]
pub async fn tv_pair_finish(
    app: tauri::AppHandle,
    state: tauri::State<'_, TvState>,
    pin: String,
) -> tv::Result<TvStatus> {
    supported()?;
    let _guard = state
        .operation
        .try_lock()
        .map_err(|_| "Another TV operation is in progress.")?;
    let generation = state.generation.load(Ordering::SeqCst);
    let pending = state
        .pending
        .lock()
        .unwrap()
        .take()
        .ok_or("Request a new pairing code.")?;
    let paired = Client::new()?.grant(&pending, pin.trim()).await;
    if state.generation.load(Ordering::SeqCst) != generation {
        return Err("Pairing cancelled.".into());
    }
    match paired {
        Ok(paired) => {
            state.save(&paired)?;
            *state.error.lock().unwrap() = None;
            *state.message.lock().unwrap() =
                Some("TV paired. Test the wake sequence before relying on automatic wake.".into());
            emit(&app);
            Ok(state.status())
        }
        Err(e) => {
            if pending.expires > Instant::now() {
                *state.pending.lock().unwrap() = Some(pending);
            }
            Err(e)
        }
    }
}
#[tauri::command]
pub async fn tv_preferences(
    app: tauri::AppHandle,
    state: tauri::State<'_, TvState>,
    auto_wake: bool,
    auto_standby: bool,
) -> tv::Result<TvStatus> {
    supported()?;
    let _guard = state
        .operation
        .try_lock()
        .map_err(|_| "Another TV operation is in progress.")?;
    let mut paired = state
        .paired
        .lock()
        .unwrap()
        .clone()
        .ok_or("Pair a TV first.")?;
    paired.auto_wake = auto_wake;
    paired.auto_standby = auto_standby;
    state.save(&paired)?;
    emit(&app);
    Ok(state.status())
}
#[tauri::command]
pub async fn tv_forget(
    app: tauri::AppHandle,
    state: tauri::State<'_, TvState>,
) -> tv::Result<TvStatus> {
    supported()?;
    let _guard = state
        .operation
        .try_lock()
        .map_err(|_| "Another TV operation is in progress.")?;
    if state.path.exists() {
        std::fs::remove_file(&state.path).map_err(|_| "Could not remove the saved TV pairing.")?;
    }
    *state.paired.lock().unwrap() = None;
    *state.pending.lock().unwrap() = None;
    *state.error.lock().unwrap() = None;
    *state.message.lock().unwrap() = None;
    state.generation.fetch_add(1, Ordering::SeqCst);
    emit(&app);
    Ok(state.status())
}
async fn wake(app: &tauri::AppHandle, automatic_request: bool) -> tv::Result<TvStatus> {
    let state = app.state::<TvState>();
    if state.sleeping.load(Ordering::SeqCst) {
        return Err("The PC is preparing to sleep or shut down.".into());
    }
    let epoch = state.power_epoch.load(Ordering::SeqCst);
    let _guard = if automatic_request {
        tokio::time::timeout(Duration::from_secs(10), state.operation.lock())
            .await
            .map_err(|_| "Another TV operation is in progress.")?
    } else {
        state
            .operation
            .try_lock()
            .map_err(|_| "Another TV operation is in progress.")?
    };
    if state.sleeping.load(Ordering::SeqCst) || state.power_epoch.load(Ordering::SeqCst) != epoch {
        return Err("TV wake cancelled because the PC is going to sleep.".into());
    }
    let mut paired = state
        .paired
        .lock()
        .unwrap()
        .clone()
        .ok_or("Pair a TV first.")?;
    if automatic_request && !paired.auto_wake {
        return Ok(state.status());
    }
    let client = Client::new()?;
    state.waking.store(true, Ordering::SeqCst);
    *state.error.lock().unwrap() = None;
    *state.message.lock().unwrap() = Some("Waking the TV…".into());
    emit(app);
    let result = tokio::select! {
        biased;
        _ = state.power_changed.notified() => Err("TV wake cancelled because the PC is going to sleep.".into()),
        result = async {
            if state.power_epoch.load(Ordering::SeqCst) != epoch || state.sleeping.load(Ordering::SeqCst) {
                return Err("TV wake cancelled because the PC is going to sleep.".into());
            }
            tokio::time::timeout(Duration::from_secs(70), tv::wake(&client, &mut paired)).await
                .map_err(|_| "The screen did not confirm it was on. Check the TV's network wake setting and try again.".to_owned()).and_then(|r|r)
        } => result,
    };
    let result = result.and_then(|_| state.save(&paired));
    state.waking.store(false, Ordering::SeqCst);
    match &result {
        Ok(()) => {
            *state.message.lock().unwrap() = Some("The TV reports that its screen is on.".into());
        }
        Err(e) => {
            *state.message.lock().unwrap() = None;
            *state.error.lock().unwrap() = Some(e.clone());
        }
    }
    emit(app);
    result.map(|_| state.status())
}
#[tauri::command]
pub async fn tv_wake(app: tauri::AppHandle) -> tv::Result<TvStatus> {
    supported()?;
    wake(&app, false).await
}
async fn send_standby(paired: &PairedTv) -> tv::Result<()> {
    paired.validate()?;
    // Never send saved credentials to an address now occupied by another device.
    if tv::resolve_mac(paired.tv.ip).await != paired.tv.mac {
        return Err(
            "The paired TV is not reachable at its saved address. Turn it on and reconnect it."
                .into(),
        );
    }
    Client::new()?.turn_off(paired).await
}
#[tauri::command]
pub async fn tv_standby(app: tauri::AppHandle) -> tv::Result<TvStatus> {
    supported()?;
    let state = app.state::<TvState>();
    let _guard = state
        .operation
        .try_lock()
        .map_err(|_| "Another TV operation is in progress.")?;
    let paired = state
        .paired
        .lock()
        .unwrap()
        .clone()
        .ok_or("Pair a TV first.")?;
    let result = tokio::time::timeout(Duration::from_secs(8), send_standby(&paired))
        .await
        .map_err(|_| "The TV did not respond to the standby command.".to_owned())
        .and_then(|r| r);
    match &result {
        Ok(()) => {
            *state.error.lock().unwrap() = None;
            // The TV may immediately disconnect; acceptance is not physical-screen confirmation.
            *state.message.lock().unwrap() = Some("The TV accepted the standby command.".into());
        }
        Err(e) => {
            *state.error.lock().unwrap() = Some(e.clone());
            *state.message.lock().unwrap() = None;
        }
    }
    emit(&app);
    result.map(|_| state.status())
}
/// Best effort: the PC must still sleep/shut down even if its TV is unavailable.
pub async fn before_pc_power(app: &tauri::AppHandle, budget: Duration) {
    let state = app.state::<TvState>();
    state.sleeping.store(true, Ordering::SeqCst);
    *state.last_auto.lock().unwrap() = None;
    state.power_epoch.fetch_add(1, Ordering::SeqCst);
    state.power_changed.notify_waiters();
    if !state
        .paired
        .lock()
        .unwrap()
        .as_ref()
        .is_some_and(|p| p.auto_standby)
    {
        return;
    }
    let result = tokio::time::timeout(budget, async {
        let _guard = state.operation.lock().await;
        let paired = state.paired.lock().unwrap().clone();
        if let Some(paired) = paired.filter(|p| p.auto_standby) {
            send_standby(&paired).await?;
        }
        Ok::<_, String>(())
    })
    .await;
    let error = match result {
        Ok(Ok(())) => None,
        Ok(Err(e)) => Some(e),
        Err(_) => {
            Some("TV standby could not finish before the PC went to sleep or shut down.".into())
        }
    };
    if let Some(e) = error {
        log::warn!("Automatic TV standby: {e}");
        *state.error.lock().unwrap() = Some(e);
    }
}
pub fn power_cancelled(app: &tauri::AppHandle) {
    app.state::<TvState>()
        .sleeping
        .store(false, Ordering::SeqCst);
}
pub fn automatic(app: &tauri::AppHandle, resume: bool) {
    if !cfg!(windows) {
        return;
    }
    let state = app.state::<TvState>();
    if resume {
        state.sleeping.store(false, Ordering::SeqCst);
    }
    if state.stopped.load(Ordering::SeqCst) {
        return;
    }
    let enabled = state
        .paired
        .lock()
        .unwrap()
        .as_ref()
        .is_some_and(|p| p.auto_wake);
    if !enabled {
        return;
    }
    let mut last = state.last_auto.lock().unwrap();
    if last.is_some_and(|t| t.elapsed() < Duration::from_secs(10)) {
        return;
    }
    *last = Some(Instant::now());
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        // Resume can precede Wi-Fi. The bounded wake sequence retries network availability.
        if let Err(e) = wake(&app, true).await {
            log::warn!("Automatic TV wake: {e}");
        }
    });
}
pub fn start(app: &tauri::AppHandle) {
    #[cfg(windows)]
    {
        windows::start_resume_listener(app.clone());
        windows::start_shutdown_listener(app.clone());
    }
    automatic(app, false);
}
pub fn shutdown(app: &tauri::AppHandle) {
    app.state::<TvState>().stopped.store(true, Ordering::SeqCst);
}
