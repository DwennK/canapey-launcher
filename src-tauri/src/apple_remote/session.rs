use super::{
    codec::{dict, Value},
    Action, ActionSink, Identity, Result,
};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
pub const MODEL: &str = "AppleTV5,3";
pub const FLAGS: u64 = 0x10f;
pub fn txt(identity: &Identity) -> BTreeMap<String, String> {
    let digest = format!("{:x}", Sha256::digest(identity.seed));
    let mac = (48..60)
        .step_by(2)
        .map(|i| digest[i..i + 2].to_uppercase())
        .collect::<Vec<_>>()
        .join(":");
    [
        ("rpMac", "2".into()),
        ("rpFl", "0xB6782".into()),
        ("rpMd", MODEL.into()),
        ("rpVr", "715.2".into()),
        ("rpHN", digest[..12].into()),
        ("rpHA", digest[12..24].into()),
        ("rpAD", digest[24..36].into()),
        ("rpHI", digest[36..48].into()),
        ("rpBA", mac),
        ("rpMRtID", identity.id.clone()),
    ]
    .into_iter()
    .map(|(k, v)| (k.into(), v))
    .collect()
}
fn system_info(identity: &Identity, name: &str, port: u16) -> Value {
    let txt = txt(identity);
    let uid = |label: &[u8]| {
        let d = Sha256::digest([&identity.seed[..], label].concat());
        uuid::Uuid::from_bytes(d[..16].try_into().unwrap())
            .to_string()
            .to_uppercase()
    };
    dict([
        ("name", name.into()),
        ("model", MODEL.into()),
        ("_sv", "715.2".into()),
        ("_i", txt["rpHI"].clone().into()),
        ("_idsID", uid(b"ids").into()),
        ("_pubID", txt["rpBA"].clone().into()),
        ("_mrID", identity.id.clone().into()),
        ("_mRtID", identity.id.clone().into()),
        ("_lP", (port as u64).into()),
        (
            "_stA",
            Value::List(
                [
                    "com.apple.tvremoteservices",
                    "com.apple.bluetooth.remote",
                    "com.apple.siri.wakeup",
                    "com.apple.home.messaging",
                    "com.apple.workflow.remotewidgets",
                    "com.apple.devicediscoveryui.rapportwake",
                ]
                .into_iter()
                .map(Value::from)
                .collect(),
            ),
        ),
        ("_sf", 65536.into()),
        ("_bf", 1920.into()),
        ("_cf", 512.into()),
        ("_clFl", 128.into()),
        ("_msSt", 1.into()),
        ("_msRo", 1.into()),
        ("_dCapF", 1.into()),
        (
            "_siriInfo",
            dict([
                ("collectorElectionVersion", Value::Float(1.0)),
                (
                    "peerData",
                    dict([
                        ("productType", MODEL.into()),
                        ("userInterfaceIdiom", "ZEUS".into()),
                        ("userAssignedDeviceName", name.into()),
                        ("assistantIdentifier", uid(b"assistant").into()),
                        ("sharedUserIdentifier", uid(b"user").into()),
                        ("isLocationSharingDevice", Value::Bool(false)),
                        ("isSiriCloudSyncEnabled", Value::Bool(false)),
                    ]),
                ),
                (
                    "audio-session-coordination.system-info",
                    dict([
                        ("isSupportedAndEnabled", Value::Bool(false)),
                        ("mediaRemoteGroupIdentifier", uid(b"group").into()),
                        ("mediaRemoteRouteIdentifier", identity.id.clone().into()),
                    ]),
                ),
            ]),
        ),
    ])
}
pub struct Session {
    sink: ActionSink,
    connection: u64,
    held: BTreeSet<&'static str>,
    edge_capable: BTreeSet<&'static str>,
    touch: Option<(f64, f64)>,
    size: (f64, f64),
    volume: f64,
}
impl Session {
    pub fn new(sink: ActionSink, connection: u64) -> Self {
        Self {
            sink,
            connection,
            held: BTreeSet::new(),
            edge_capable: BTreeSet::new(),
            touch: None,
            size: (1000., 1000.),
            volume: 0.5,
        }
    }
    fn edge(&mut self, action: &'static str, pressed: bool) {
        let changed = if pressed {
            self.held.insert(action)
        } else {
            self.held.remove(action)
        };
        if changed {
            (self.sink)(Action {
                source: "iphone",
                connection: self.connection,
                action,
                pressed,
            });
        }
    }
    fn tap(&mut self, action: &'static str) {
        self.edge(action, true);
        self.edge(action, false);
    }
    fn release_all(&mut self) {
        self.touch = None;
        for action in std::mem::take(&mut self.held) {
            (self.sink)(Action {
                source: "iphone",
                connection: self.connection,
                action: if action == "accept" {
                    "accept-cancel"
                } else {
                    action
                },
                pressed: false,
            });
        }
    }
    pub fn handle(
        &mut self,
        message: &Value,
        identity: &Identity,
        name: &str,
        port: u16,
    ) -> Result<Vec<Value>> {
        let ident = message.get("_i")?.text()?;
        let empty = dict([]);
        let content = message.get("_c").unwrap_or(&empty);
        let mut body = dict([]);
        let mut extra = vec![];
        let n = |key| content.get(key)?.uint();
        match ident {
            "_systemInfo" => body = system_info(identity, name, port),
            "_hidC" => {
                let action = match n("_hidC")? {
                    1 => Some("up"),
                    2 => Some("down"),
                    3 => Some("left"),
                    4 => Some("right"),
                    5 => Some("back"),
                    6 => Some("accept"),
                    7 => Some("home"),
                    8 => Some("volumeUp"),
                    9 => Some("volumeDown"),
                    14 => Some("playPause"),
                    _ => None,
                };
                if let Some(action) = action {
                    match n("_hBtS")? {
                        1 => {
                            self.edge_capable.insert(action);
                            self.edge(action, true);
                        }
                        2 => {
                            if !self.held.contains(action) && !self.edge_capable.contains(action) {
                                self.edge(action, true);
                            }
                            self.edge(action, false);
                        }
                        _ => {}
                    }
                }
            }
            "_mcc" => match n("_mcc")? {
                1 | 2 => self.tap("playPause"),
                3 => self.tap("nextTrack"),
                4 => self.tap("previousTrack"),
                5 => body = dict([("_vol", Value::Float(self.volume))]),
                6 => {
                    let new = content.get("_vol")?.number()?.clamp(0., 1.);
                    if new != self.volume {
                        self.tap(if new > self.volume {
                            "volumeUp"
                        } else {
                            "volumeDown"
                        });
                    }
                    self.volume = new;
                }
                _ => {}
            },
            "_touchStart" => {
                let w = content.get("_width")?.number()?;
                let h = content.get("_height")?.number()?;
                if !(1.0..=10000.).contains(&w) || !(1.0..=10000.).contains(&h) {
                    return Err(super::Error::Protocol);
                }
                self.size = (w, h);
                self.touch = None;
                body = dict([("_i", 1.into())]);
            }
            "_hidT" => {
                let point = (content.get("_cx")?.number()?, content.get("_cy")?.number()?);
                if point.0.abs() > 100000. || point.1.abs() > 100000. {
                    return Err(super::Error::Protocol);
                }
                match n("_tPh")? {
                    1 => self.touch = Some(point),
                    4 => {
                        if let Some(start) = self.touch.take() {
                            let dx = point.0 - start.0;
                            let dy = point.1 - start.1;
                            if dx.abs() >= dy.abs() && dx.abs() > self.size.0 * 0.15 {
                                self.tap(if dx > 0. { "right" } else { "left" });
                            } else if dy.abs() > dx.abs() && dy.abs() > self.size.1 * 0.15 {
                                self.tap(if dy > 0. { "down" } else { "up" });
                            }
                        }
                    }
                    _ => {}
                }
            }
            "_touchStop" => self.touch = None,
            "_sessionStop" | "TVRCSessionStop" => self.release_all(),
            "FetchMediaControlStatus" => body = dict([("MediaControlFlags", FLAGS.into())]),
            "_sessionStart" => {
                body = dict([(
                    "_sid",
                    (u32::from_le_bytes(super::auth::random()) as u64).into(),
                )])
            }
            "TVRCSessionStart" => body = content.clone(),
            "FetchAttentionState" => body = dict([("state", 3.into())]),
            "_interest" => {
                if let Ok(Value::List(events)) = content.get("_regEvents") {
                    if events.contains(&"_iMC".into()) {
                        extra.push(dict([
                            ("_i", "_iMC".into()),
                            ("_x", 0.into()),
                            ("_t", 1.into()),
                            ("_c", dict([("_mcF", FLAGS.into())])),
                        ]));
                    }
                }
            }
            _ => {}
        }
        extra.push(dict([
            ("_x", message.get("_x").cloned().unwrap_or(0.into())),
            ("_t", 3.into()),
            ("_c", body),
        ]));
        Ok(extra)
    }
}
impl Drop for Session {
    fn drop(&mut self) {
        self.release_all();
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};
    #[test]
    fn duplicate_edges_and_session_stop_never_validate_twice() {
        let actions = Arc::new(Mutex::new(vec![]));
        let log = actions.clone();
        let mut session = Session::new(Arc::new(move |a| log.lock().unwrap().push(a)), 1);
        let identity = Identity::new();
        for state in [1, 1, 2, 2, 1] {
            session
                .handle(
                    &dict([
                        ("_i", "_hidC".into()),
                        ("_c", dict([("_hidC", 6.into()), ("_hBtS", state.into())])),
                    ]),
                    &identity,
                    "test",
                    1,
                )
                .unwrap();
        }
        session
            .handle(&dict([("_i", "_sessionStop".into())]), &identity, "test", 1)
            .unwrap();
        drop(session);
        let log = actions.lock().unwrap();
        assert_eq!(log.len(), 4);
        assert_eq!(
            log.iter()
                .filter(|a| a.action == "accept" && !a.pressed)
                .count(),
            1
        );
        assert_eq!(log.last().unwrap().action, "accept-cancel");
    }
    #[test]
    fn swipe_is_one_step_and_disconnect_releases() {
        let actions = Arc::new(Mutex::new(vec![]));
        let log = actions.clone();
        let mut s = Session::new(Arc::new(move |a| log.lock().unwrap().push(a)), 1);
        let id = Identity::new();
        for (phase, x) in [(1, 0), (2, 400), (4, 800)] {
            s.handle(
                &dict([
                    ("_i", "_hidT".into()),
                    (
                        "_c",
                        dict([("_tPh", phase.into()), ("_cx", x.into()), ("_cy", 0.into())]),
                    ),
                ]),
                &id,
                "test",
                1,
            )
            .unwrap();
        }
        assert_eq!(actions.lock().unwrap().len(), 2);
        s.handle(
            &dict([
                ("_i", "_hidC".into()),
                ("_c", dict([("_hidC", 6.into()), ("_hBtS", 1.into())])),
            ]),
            &id,
            "test",
            1,
        )
        .unwrap();
        drop(s);
        let log = actions.lock().unwrap();
        assert_eq!(log.last().unwrap().action, "accept-cancel");
        assert!(!log.last().unwrap().pressed);
    }
}
