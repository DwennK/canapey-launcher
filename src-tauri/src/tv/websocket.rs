//! Bounded SSAP and Samsung remote-control sessions. URLs never come from a TV response.
use super::*;
use base64::{engine::general_purpose::STANDARD, Engine};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::time::Duration;
use tokio::net::TcpStream;
use tokio_tungstenite::{
    connect_async_tls_with_config,
    tungstenite::{protocol::WebSocketConfig, Message},
    Connector, MaybeTlsStream, WebSocketStream,
};
type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;
const ERROR: &str = "The TV connection failed. Check network control and allow Canapey on the TV.";

async fn connect(tv: &Television, token: Option<&str>) -> Result<Socket> {
    tv.validate()?;
    let (port, path) = match tv.protocol {
        TvProtocol::LgWebos => (if tv.secure { 3001 } else { 3000 }, String::from("/")),
        TvProtocol::SamsungTizen => {
            let mut url =
                url::Url::parse("http://local/api/v2/channels/samsung.remote.control").unwrap();
            url.query_pairs_mut()
                .append_pair("name", &STANDARD.encode("Canapey Launcher"));
            if let Some(key) = token {
                url.query_pairs_mut().append_pair("token", key);
            }
            (8002, format!("{}?{}", url.path(), url.query().unwrap()))
        }
        _ => return Err(ERROR.into()),
    };
    let scheme = if tv.secure { "wss" } else { "ws" };
    let url = format!("{scheme}://{}:{port}{path}", tv.ip);
    // These LAN TV endpoints use device-issued certificates. No redirects, proxy or arbitrary hosts.
    let tls = native_tls::TlsConnector::builder()
        .danger_accept_invalid_certs(true)
        .danger_accept_invalid_hostnames(true)
        .build()
        .map_err(|_| ERROR)?;
    let config = WebSocketConfig::default()
        .max_message_size(Some(65_536))
        .max_frame_size(Some(65_536));
    let (socket, _) = tokio::time::timeout(
        Duration::from_secs(4),
        connect_async_tls_with_config(url, Some(config), true, Some(Connector::NativeTls(tls))),
    )
    .await
    .map_err(|_| ERROR)?
    .map_err(|_| ERROR)?;
    Ok(socket)
}
pub(super) async fn probe_lg(tv: &mut Television) -> bool {
    for secure in [true, false] {
        tv.secure = secure;
        if let Ok(mut socket) = connect(tv, None).await {
            let _ = socket.close(None).await;
            return true;
        }
    }
    false
}
pub(super) async fn inspect_lg(ip: Ipv4Addr) -> Option<Television> {
    let mut tv = Television {
        protocol: TvProtocol::LgWebos,
        secure: true,
        name: "LG webOS TV".into(),
        ip,
        mac: None,
    };
    for secure in [true, false] {
        tv.secure = secure;
        let result = tokio::time::timeout(Duration::from_secs(4), async {
            let mut socket = connect(&tv, None).await?;
            // This is a read-only SSAP query, not registration; it cannot request pairing.
            send(&mut socket, json!({"id":"canapey-inspect","type":"request","uri":"ssap://system/getSystemInfo","payload":{}})).await?;
            loop {
                let value = receive(&mut socket).await?;
                if value["id"] != "canapey-inspect" { continue; }
                return lg_identity(&value).ok_or_else(|| "Not a recognized webOS response.".to_owned());
            }
        }).await;
        if let Ok(Ok(name)) = result {
            tv.name = name;
            tv.mac = resolve_mac(ip).await;
            tv.validate().ok()?;
            return Some(tv);
        }
    }
    None
}
fn lg_identity(value: &Value) -> Option<String> {
    if value["type"] == "response" && value["payload"]["returnValue"] == true {
        return value["payload"]["modelName"]
            .as_str()
            .filter(|name| !name.is_empty())
            .map(|name| format!("LG {name}"));
    }
    if value["type"] == "error"
        && value["error"]
            .as_str()
            .is_some_and(|error| error.starts_with("401"))
    {
        return Some("LG webOS TV".into());
    }
    None
}
async fn send(socket: &mut Socket, value: Value) -> Result<()> {
    socket
        .send(Message::Text(value.to_string().into()))
        .await
        .map_err(|_| ERROR.into())
}
async fn receive(socket: &mut Socket) -> Result<Value> {
    while let Some(message) = socket.next().await {
        match message.map_err(|_| ERROR)? {
            Message::Text(text) => {
                return serde_json::from_str(&text)
                    .map_err(|_| "The TV returned an unexpected response.".into())
            }
            Message::Ping(data) => socket.send(Message::Pong(data)).await.map_err(|_| ERROR)?,
            Message::Close(_) => return Err(ERROR.into()),
            _ => {}
        }
    }
    Err(ERROR.into())
}
fn lg_registration(key: Option<&str>) -> Value {
    let mut payload = json!({"forcePairing":false,"pairingType":"PROMPT","manifest":{"manifestVersion":1,"appVersion":"1.0","permissions":["CONTROL_POWER","CONTROL_TV_SCREEN","READ_POWER_STATE"]}});
    if let Some(key) = key {
        payload["client-key"] = json!(key);
    }
    json!({"id":"canapey-register","type":"register","payload":payload})
}
fn lg_key(v: &Value) -> Result<Option<String>> {
    if v["type"] == "error" {
        return Err("The TV rejected this pairing. Pair it again in Controls → TV.".into());
    }
    if v["type"] != "registered" {
        return Ok(None);
    }
    v["payload"]["client-key"]
        .as_str()
        .filter(|k| !k.is_empty() && k.len() <= 4096)
        .map(|s| Some(s.to_owned()))
        .ok_or_else(|| "The TV returned an invalid pairing response.".into())
}
fn samsung_key(v: &Value, saved: Option<&str>) -> Result<Option<String>> {
    match v["event"].as_str() {
        Some("ms.channel.unauthorized" | "ms.channel.timeOut") => {
            Err("The TV rejected this pairing. Pair it again in Controls → TV.".into())
        }
        Some("ms.channel.connect") => v["data"]["token"]
            .as_str()
            .or(saved)
            .filter(|k| !k.is_empty() && k.len() <= 4096)
            .map(|s| Some(s.to_owned()))
            .ok_or_else(|| "The TV did not provide a reusable pairing token.".into()),
        _ => Ok(None),
    }
}
async fn authorized(tv: &Television, key: Option<&str>) -> Result<(Socket, String)> {
    let socket = connect(tv, key).await?;
    register(socket, tv.protocol, key).await
}
async fn register(
    mut socket: Socket,
    protocol: TvProtocol,
    key: Option<&str>,
) -> Result<(Socket, String)> {
    if protocol == TvProtocol::LgWebos {
        send(&mut socket, lg_registration(key)).await?;
    }
    // Do not silently show a new permission prompt when an existing token is rejected.
    loop {
        let v = receive(&mut socket).await?;
        if key.is_some()
            && protocol == TvProtocol::LgWebos
            && v["payload"]["pairingType"] == "PROMPT"
        {
            return Err("The TV rejected this pairing. Pair it again in Controls → TV.".into());
        }
        let result = if protocol == TvProtocol::LgWebos {
            lg_key(&v)
        } else {
            samsung_key(&v, key)
        }?;
        if let Some(key) = result {
            return Ok((socket, key));
        }
    }
}
pub(super) async fn pair(tv: &Television) -> Result<Credentials> {
    let (mut socket, key) = tokio::time::timeout(Duration::from_secs(55), authorized(tv, None))
        .await
        .map_err(|_| "Pairing timed out. Allow Canapey on the TV, then connect again.")??;
    let _ = socket.close(None).await;
    Ok(Credentials {
        username: "Canapey".into(),
        password: key,
    })
}
async fn lg_request(tv: &PairedTv, endpoint: &str) -> Result<Value> {
    let (mut socket, _) = authorized(&tv.tv, Some(&tv.credentials.password)).await?;
    send(&mut socket, json!({"id":"canapey-command","type":"request","uri":format!("ssap://{endpoint}"),"payload":{}})).await?;
    if endpoint == "system/turnOff" {
        // webOS can disconnect immediately after accepting standby.
        return Ok(json!({"returnValue":true}));
    }
    loop {
        let v = receive(&mut socket).await?;
        if v["id"] != "canapey-command" {
            continue;
        }
        if v["type"] == "error" || v["payload"]["returnValue"] == false {
            return Err("This TV command is unavailable on this model.".into());
        }
        if v["type"] != "response" {
            continue;
        }
        return Ok(v["payload"].clone());
    }
}
fn lg_state(v: &Value) -> PowerState {
    match v["state"].as_str() {
        Some("Active") => PowerState {
            power: Some("On".into()),
            screen: Some("On".into()),
        },
        Some("Screen Off") => PowerState {
            power: Some("On".into()),
            screen: Some("Off".into()),
        },
        Some("Suspend" | "Standby" | "Active Standby" | "Power Off") => PowerState {
            power: Some("Standby".into()),
            screen: Some("Off".into()),
        },
        _ => PowerState::default(),
    }
}
pub(super) async fn lg_power(tv: &PairedTv) -> Result<PowerState> {
    let v = tokio::time::timeout(
        Duration::from_secs(6),
        lg_request(tv, "com.webos.service.tvpower/power/getPowerState"),
    )
    .await
    .map_err(|_| ERROR)??;
    Ok(lg_state(&v))
}
fn samsung_command(on: bool) -> Value {
    json!({"method":"ms.remote.control","params":{"Cmd":"Click","DataOfCmd":if on {"KEY_POWERON"} else {"KEY_POWEROFF"},"Option":"false","TypeOfRemote":"SendRemoteKey"}})
}
pub(super) async fn set_power(tv: &PairedTv, on: bool) -> Result<()> {
    tokio::time::timeout(Duration::from_secs(6), async {
        if tv.tv.protocol == TvProtocol::LgWebos {
            let state =
                lg_state(&lg_request(tv, "com.webos.service.tvpower/power/getPowerState").await?);
            if on {
                if state.power.as_deref() == Some("Standby") {
                    lg_request(tv, "system/turnOn").await?;
                }
                lg_request(tv, "com.webos.service.tvpower/power/turnOnScreen").await?;
            } else {
                match state.power.as_deref() {
                    Some("Standby") => return Ok(()),
                    Some("On") => {
                        lg_request(tv, "system/turnOff").await?;
                    }
                    _ => return Err("The TV power state is unknown. Standby was not sent.".into()),
                }
            }
        } else {
            let (mut socket, _) = authorized(&tv.tv, Some(&tv.credentials.password)).await?;
            send(&mut socket, samsung_command(on)).await?;
            // Samsung does not acknowledge keys. Delivery is not confirmation of physical power.
            let _ = socket.close(None).await;
        }
        Ok::<(), String>(())
    })
    .await
    .map_err(|_| ERROR)?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn lg_authorization_exchanges_real_frames_and_keeps_the_key_native() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut ws = tokio_tungstenite::accept_async(stream).await.unwrap();
            let message = ws.next().await.unwrap().unwrap().into_text().unwrap();
            let request: Value = serde_json::from_str(&message).unwrap();
            assert_eq!(request["type"], "register");
            assert!(request["payload"]["client-key"].is_null());
            for frame in [
                json!({"type":"response","payload":{"pairingType":"PROMPT"}}),
                json!({"type":"registered","payload":{"client-key":"synthetic-key"}}),
            ] {
                ws.send(Message::Text(frame.to_string().into()))
                    .await
                    .unwrap();
            }
        });
        let (socket, _) = tokio_tungstenite::connect_async(format!("ws://{address}/"))
            .await
            .unwrap();
        let (_, key) = tokio::time::timeout(
            Duration::from_secs(2),
            register(socket, TvProtocol::LgWebos, None),
        )
        .await
        .unwrap()
        .unwrap();
        assert_eq!(key, "synthetic-key");
        server.await.unwrap();
    }
    #[tokio::test]
    async fn samsung_denial_is_an_error_not_a_successful_connection() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut ws = tokio_tungstenite::accept_async(stream).await.unwrap();
            ws.send(Message::Text(
                json!({"event":"ms.channel.unauthorized"})
                    .to_string()
                    .into(),
            ))
            .await
            .unwrap();
        });
        let (socket, _) = tokio_tungstenite::connect_async(format!("ws://{address}/"))
            .await
            .unwrap();
        let result = tokio::time::timeout(
            Duration::from_secs(2),
            register(socket, TvProtocol::SamsungTizen, Some("revoked")),
        )
        .await
        .unwrap();
        assert!(matches!(result, Err(e) if e.contains("rejected this pairing")));
        server.await.unwrap();
    }
    #[test]
    fn manual_webos_probe_requires_ssap_identity() {
        assert_eq!(
            lg_identity(
                &json!({"type":"response","payload":{"returnValue":true,"modelName":"OLED TV"}})
            )
            .as_deref(),
            Some("LG OLED TV")
        );
        assert_eq!(
            lg_identity(&json!({"type":"error","error":"401 insufficient permissions"})).as_deref(),
            Some("LG webOS TV")
        );
        assert!(lg_identity(&json!({"type":"response","payload":{"returnValue":true}})).is_none());
        assert!(lg_identity(&json!({"type":"error","error":"500 unknown"})).is_none());
    }
    #[test]
    fn registrations_require_real_tokens_and_propagate_denial() {
        assert!(lg_key(&json!({"type":"registered","payload":{}})).is_err());
        assert!(lg_key(&json!({"type":"error"})).is_err());
        assert_eq!(
            lg_key(&json!({"type":"registered","payload":{"client-key":"synthetic"}}))
                .unwrap()
                .as_deref(),
            Some("synthetic")
        );
        assert!(samsung_key(&json!({"event":"ms.channel.unauthorized"}), None).is_err());
        assert!(samsung_key(&json!({"event":"ms.channel.connect"}), None).is_err());
        assert_eq!(
            samsung_key(&json!({"event":"ms.channel.connect"}), Some("saved"))
                .unwrap()
                .as_deref(),
            Some("saved")
        );
        assert!(lg_registration(None)["payload"]["client-key"].is_null());
    }
    #[test]
    fn power_is_absolute_and_unknown_or_blank_screen_is_not_success() {
        assert_eq!(samsung_command(true)["params"]["DataOfCmd"], "KEY_POWERON");
        assert_eq!(
            samsung_command(false)["params"]["DataOfCmd"],
            "KEY_POWEROFF"
        );
        assert!(lg_state(&json!({"state":"Active"})).screen_on());
        for state in ["Screen Off", "Active Standby", "unknown", ""] {
            assert!(!lg_state(&json!({"state":state})).screen_on());
        }
    }
}
