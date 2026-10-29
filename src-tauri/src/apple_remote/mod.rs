//! Native Apple Companion receiver. No Python is shipped. See docs/APPLE_REMOTE.md.
mod auth;
pub mod codec;
pub mod server;
mod session;
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tokio::sync::watch;
use zeroize::Zeroize;

#[derive(Debug)]
pub enum Error {
    Protocol,
    Auth,
    Limit,
    Io,
    Storage,
}
impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}",
            match self {
                Self::Protocol => "Invalid Companion message",
                Self::Auth => "Pairing or authentication rejected",
                Self::Limit => "Connection limit reached",
                Self::Io => "Connection interrupted",
                Self::Storage => "Could not save paired devices",
            }
        )
    }
}
impl std::error::Error for Error {}
impl From<std::io::Error> for Error {
    fn from(_: std::io::Error) -> Self {
        Self::Io
    }
}
pub type Result<T> = std::result::Result<T, Error>;

#[derive(Clone, Serialize, Deserialize)]
pub struct Identity {
    pub id: String,
    pub seed: [u8; 32],
    pub clients: BTreeMap<String, [u8; 32]>,
}
impl Default for Identity {
    fn default() -> Self {
        Self::new()
    }
}
impl Identity {
    pub fn new() -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string().to_uppercase(),
            seed: auth::random(),
            clients: BTreeMap::new(),
        }
    }
    pub fn validate(&self) -> Result<()> {
        if uuid::Uuid::parse_str(&self.id).is_err()
            || self.clients.len() > 8
            || self.clients.keys().any(|k| k.is_empty() || k.len() > 128)
        {
            Err(Error::Storage)
        } else {
            Ok(())
        }
    }
}
impl Drop for Identity {
    fn drop(&mut self) {
        self.seed.zeroize();
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub enabled: bool,
    pub name: String,
    pub interface: Option<String>,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            enabled: false,
            name: format!(
                "Canapey — {}",
                std::env::var("COMPUTERNAME").unwrap_or_else(|_| "Salon".into())
            ),
            interface: None,
        }
    }
}
impl Settings {
    pub fn validate(&self) -> std::result::Result<(), String> {
        if self.name.trim().is_empty()
            || self.name.len() > 63
            || self.name.chars().any(char::is_control)
        {
            return Err("Choose a name between 1 and 63 bytes with no control characters.".into());
        }
        if self.interface.as_ref().is_some_and(|s| s.len() > 128) {
            return Err("Invalid network interface.".into());
        }
        Ok(())
    }
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Action {
    pub source: &'static str,
    pub connection: u64,
    pub action: &'static str,
    pub pressed: bool,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingStatus {
    pub pin: Option<String>,
    pub seconds_remaining: u64,
    pub devices: Vec<Device>,
}
#[derive(Clone, Serialize)]
pub struct Device {
    pub id: String,
    pub connected: bool,
}
struct Pairing {
    pin: zeroize::Zeroizing<String>,
    until: Instant,
    attempts: u8,
    generation: u64,
}
struct Inner {
    identity: Identity,
    pairing: Option<Pairing>,
    generation: u64,
    connected: BTreeMap<u64, String>,
}
pub type Persist = Arc<dyn Fn(&Identity) -> Result<()> + Send + Sync>;
pub type ActionSink = Arc<dyn Fn(Action) + Send + Sync>;
pub struct Hub {
    inner: Mutex<Inner>,
    persist: Persist,
    pub(crate) actions: ActionSink,
    pub(crate) changes: watch::Sender<u64>,
}
impl Hub {
    pub fn new(identity: Identity, persist: Persist, actions: ActionSink) -> Result<Arc<Self>> {
        identity.validate()?;
        let (changes, _) = watch::channel(0);
        Ok(Arc::new(Self {
            inner: Mutex::new(Inner {
                identity,
                pairing: None,
                generation: 0,
                connected: BTreeMap::new(),
            }),
            persist,
            actions,
            changes,
        }))
    }
    fn changed(&self) {
        self.changes.send_modify(|n| *n = n.wrapping_add(1));
    }
    pub fn begin_pairing(&self) -> Result<()> {
        let mut inner = self.inner.lock().unwrap();
        if inner.identity.clients.len() >= 8 {
            return Err(Error::Limit);
        }
        use rand::Rng;
        let pin = format!("{:04}", rand::rngs::OsRng.gen_range(0..10000));
        inner.generation = inner.generation.wrapping_add(1);
        inner.pairing = Some(Pairing {
            pin: zeroize::Zeroizing::new(pin),
            until: Instant::now() + Duration::from_secs(120),
            attempts: 0,
            generation: inner.generation,
        });
        drop(inner);
        self.changed();
        Ok(())
    }
    pub fn cancel_pairing(&self) {
        self.inner.lock().unwrap().pairing = None;
        self.changed();
    }
    pub fn status(&self) -> PairingStatus {
        let inner = self.inner.lock().unwrap();
        let active = inner.pairing.as_ref().filter(|p| p.until > Instant::now());
        PairingStatus {
            pin: active.map(|p| p.pin.to_string()),
            seconds_remaining: active.map_or(0, |p| {
                p.until.saturating_duration_since(Instant::now()).as_secs() + 1
            }),
            devices: inner
                .identity
                .clients
                .keys()
                .map(|id| Device {
                    id: id.clone(),
                    connected: inner.connected.values().any(|c| c == id),
                })
                .collect(),
        }
    }
    pub fn revoke(&self, id: &str) -> Result<()> {
        let mut inner = self.inner.lock().unwrap();
        let mut next = inner.identity.clone();
        next.clients.remove(id);
        (self.persist)(&next)?;
        inner.identity = next;
        drop(inner);
        self.changed();
        Ok(())
    }
    pub(crate) fn identity(&self) -> Identity {
        self.inner.lock().unwrap().identity.clone()
    }
    pub(crate) fn allowed(&self, id: &str) -> bool {
        self.inner.lock().unwrap().identity.clients.contains_key(id)
    }
    /// Recheck queued native actions when a device disconnects or is revoked.
    pub fn connection_allowed(&self, connection: u64) -> bool {
        let inner = self.inner.lock().unwrap();
        inner
            .connected
            .get(&connection)
            .is_some_and(|id| inner.identity.clients.contains_key(id))
    }
    pub(crate) fn pin(&self, start: bool, ticket: &mut Option<u64>) -> Result<String> {
        let mut inner = self.inner.lock().unwrap();
        let p = inner
            .pairing
            .as_mut()
            .filter(|p| p.until > Instant::now())
            .ok_or(Error::Auth)?;
        if start {
            if p.attempts >= 5 {
                return Err(Error::Limit);
            }
            p.attempts += 1;
            *ticket = Some(p.generation);
        }
        if *ticket != Some(p.generation) {
            return Err(Error::Auth);
        }
        Ok(p.pin.to_string())
    }
    pub(crate) fn paired(&self, id: String, pk: [u8; 32], ticket: Option<u64>) -> Result<()> {
        let mut inner = self.inner.lock().unwrap();
        if !inner
            .pairing
            .as_ref()
            .is_some_and(|p| Some(p.generation) == ticket && p.until > Instant::now())
        {
            return Err(Error::Auth);
        }
        let mut next = inner.identity.clone();
        if next.clients.len() >= 8 {
            return Err(Error::Limit);
        }
        next.clients.insert(id, pk);
        (self.persist)(&next)?;
        inner.identity = next;
        inner.pairing = None;
        drop(inner);
        self.changed();
        Ok(())
    }
    pub(crate) fn connected(&self, connection: u64, id: Option<String>) {
        let mut inner = self.inner.lock().unwrap();
        if let Some(id) = id {
            inner.connected.insert(connection, id);
        } else {
            inner.connected.remove(&connection);
        }
        drop(inner);
        self.changed();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn hub() -> Arc<Hub> {
        Hub::new(Identity::new(), Arc::new(|_| Ok(())), Arc::new(|_| {})).unwrap()
    }
    #[test]
    fn pairing_expires_cancels_and_limits_attempts() {
        let h = hub();
        let mut ticket = None;
        assert!(h.pin(true, &mut ticket).is_err());
        h.begin_pairing().unwrap();
        for _ in 0..5 {
            assert_eq!(h.pin(true, &mut ticket).unwrap().len(), 4);
        }
        assert!(h.pin(true, &mut ticket).is_err());
        h.begin_pairing().unwrap();
        assert!(h.pin(false, &mut ticket).is_err());
        h.pin(true, &mut ticket).unwrap();
        h.cancel_pairing();
        assert!(h.paired("phone".into(), [1; 32], ticket).is_err());
        h.begin_pairing().unwrap();
        h.inner.lock().unwrap().pairing.as_mut().unwrap().until =
            Instant::now() - Duration::from_secs(1);
        assert!(h.status().pin.is_none());
        assert!(h.pin(true, &mut ticket).is_err());
    }
    #[test]
    fn durable_pairing_then_revocation_and_no_implicit_repair() {
        let h = hub();
        h.begin_pairing().unwrap();
        let mut ticket = None;
        h.pin(true, &mut ticket).unwrap();
        h.paired("phone".into(), [1; 32], ticket).unwrap();
        assert!(h.allowed("phone"));
        assert!(h.status().pin.is_none());
        assert!(h.pin(true, &mut ticket).is_err());
        h.revoke("phone").unwrap();
        assert!(!h.allowed("phone"));
    }
    #[test]
    fn disk_failure_does_not_authorize_phone() {
        let h = Hub::new(
            Identity::new(),
            Arc::new(|_| Err(Error::Storage)),
            Arc::new(|_| {}),
        )
        .unwrap();
        h.begin_pairing().unwrap();
        let mut ticket = None;
        h.pin(true, &mut ticket).unwrap();
        assert!(h.paired("phone".into(), [1; 32], ticket).is_err());
        assert!(!h.allowed("phone"));
    }
    #[test]
    fn legacy_settings_disable_network_receiver() {
        let settings: crate::model::Settings = serde_json::from_str("{}").unwrap();
        assert!(!settings.apple_remote.enabled);
        assert!(Settings {
            name: "".into(),
            ..Default::default()
        }
        .validate()
        .is_err());
    }
}
