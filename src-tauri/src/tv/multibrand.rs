use super::*;
use reqwest::{Client as HttpClient, Method};
use serde_json::{json, Value};
use std::time::{Duration, Instant};

#[derive(Clone)]
pub struct Client {
    pub(super) http: HttpClient,
    philips: protocol::Client,
}
pub struct PendingPair {
    pub tv: Television,
    pub expires: Instant,
    philips: Option<protocol::PendingPair>,
}
impl Client {
    pub fn new() -> Result<Self> {
        Ok(Self {
            philips: protocol::Client::new()?,
            http: HttpClient::builder()
                .danger_accept_invalid_certs(true)
                .no_proxy()
                .redirect(reqwest::redirect::Policy::none())
                .connect_timeout(Duration::from_secs(2))
                .timeout(Duration::from_secs(4))
                .build()
                .map_err(|_| "Could not start the TV connection.")?,
        })
    }
    pub(super) async fn text(
        &self,
        url: &str,
        body: Option<&Value>,
        psk: Option<&str>,
        post: bool,
    ) -> Result<String> {
        let mut request = self
            .http
            .request(if post { Method::POST } else { Method::GET }, url);
        if let Some(v) = body {
            request = request
                .header("Content-Type", "application/json")
                .body(v.to_string());
        }
        if let Some(key) = psk {
            request = request.header("X-Auth-PSK", key);
        }
        let mut response = request
            .send()
            .await
            .map_err(|_| "The TV is not responding. Check its network connection.")?;
        if matches!(response.status().as_u16(), 401 | 403) {
            return Err(
                "The TV rejected access. Check its network control permissions and reconnect it."
                    .into(),
            );
        }
        if !response.status().is_success() {
            return Err("This TV command is unavailable on this model.".into());
        }
        if response.content_length().is_some_and(|n| n > 65_536) {
            return Err("The TV response is too large.".into());
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| "Could not read the TV response.")?
        {
            if bytes.len() + chunk.len() > 65_536 {
                return Err("The TV response is too large.".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        String::from_utf8(bytes).map_err(|_| "The TV returned an unexpected response.".into())
    }
    async fn json(&self, url: &str, body: Option<&Value>, key: Option<&str>) -> Result<Value> {
        let text = self.text(url, body, key, body.is_some()).await?;
        serde_json::from_str(&text).map_err(|_| "The TV returned an unexpected response.".into())
    }
    pub async fn inspect(&self, ip: Ipv4Addr) -> Result<Television> {
        if let Ok(tv) = self.inspect_services(ip).await {
            return Ok(tv);
        }
        // webOS advertises its device description through SSDP rather than a fixed HTTP port.
        if let Some(tv) = network::find_webos(self, ip).await {
            return Ok(tv);
        }
        websocket::inspect_lg(ip).await.ok_or_else(|| "No supported TV API found. Check network control on the TV. Google TV and VIDAA models are not supported yet.".into())
    }
    pub(super) async fn inspect_services(&self, ip: Ipv4Addr) -> Result<Television> {
        local_ip(&ip.to_string())?;
        let (philips, samsung, sony, roku) = tokio::join!(
            self.philips.inspect(ip),
            self.inspect_samsung(ip),
            self.inspect_sony(ip),
            self.inspect_roku(ip)
        );
        [philips, samsung, sony, roku]
            .into_iter()
            .find_map(std::result::Result::ok)
            .ok_or_else(|| "No supported TV API found.".into())
    }
    async fn samsung(&self, ip: Ipv4Addr) -> Result<Value> {
        let secure_url = format!("https://{ip}:8002/api/v2/");
        let plain_url = format!("http://{ip}:8001/api/v2/");
        let (secure, plain) = tokio::join!(
            self.json(&secure_url, None, None),
            self.json(&plain_url, None, None)
        );
        secure.or(plain)
    }
    async fn inspect_samsung(&self, ip: Ipv4Addr) -> Result<Television> {
        let data = self.samsung(ip).await?;
        let d = &data["device"];
        if d["type"] != "Samsung SmartTV" {
            return Err("Not a Samsung Tizen TV.".into());
        }
        let tv = Television {
            protocol: TvProtocol::SamsungTizen,
            secure: true,
            name: d["name"].as_str().unwrap_or("Samsung TV").into(),
            ip,
            mac: resolve_mac(ip).await,
        };
        tv.validate()?;
        Ok(tv)
    }
    async fn sony(
        &self,
        ip: Ipv4Addr,
        secure: bool,
        method: &str,
        params: Value,
        key: Option<&str>,
    ) -> Result<Value> {
        let scheme = if secure { "https" } else { "http" };
        let v = self
            .json(
                &format!("{scheme}://{ip}/sony/system"),
                Some(&json!({"method":method,"params":params,"id":1,"version":"1.0"})),
                key,
            )
            .await?;
        if !v["error"].is_null() {
            return Err(
                "Sony rejected the command. Check the pre-shared key and IP control settings."
                    .into(),
            );
        }
        if !v["result"].is_array() {
            return Err("The TV returned an unexpected response.".into());
        }
        Ok(v)
    }
    async fn inspect_sony(&self, ip: Ipv4Addr) -> Result<Television> {
        for secure in [true, false] {
            if let Ok(v) = self
                .sony(ip, secure, "getSystemInformation", json!([]), None)
                .await
            {
                let d = &v["result"][0];
                if d["product"] != "TV" {
                    continue;
                }
                let tv = Television {
                    protocol: TvProtocol::SonyBravia,
                    secure,
                    name: d["name"]
                        .as_str()
                        .or(d["model"].as_str())
                        .unwrap_or("Sony BRAVIA")
                        .into(),
                    ip,
                    mac: resolve_mac(ip)
                        .await
                        .or_else(|| valid_mac_value(d["macAddr"].as_str())),
                };
                tv.validate()?;
                return Ok(tv);
            }
        }
        Err("Sony IP control is unavailable. Enable IP control and Remote start on the TV.".into())
    }
    async fn roku(&self, ip: Ipv4Addr) -> Result<RokuInfo> {
        let text = self
            .text(
                &format!("http://{ip}:8060/query/device-info"),
                None,
                None,
                false,
            )
            .await?;
        parse_roku(&text)
    }
    async fn inspect_roku(&self, ip: Ipv4Addr) -> Result<Television> {
        let d = self.roku(ip).await?;
        let tv = Television {
            protocol: TvProtocol::Roku,
            secure: false,
            name: d.name(),
            ip,
            mac: resolve_mac(ip).await.or_else(|| d.mac()),
        };
        tv.validate()?;
        Ok(tv)
    }
    pub async fn pair(&self, mut tv: Television) -> Result<PendingPair> {
        tv.validate()?;
        if tv.protocol == TvProtocol::Philips {
            let pending = self.philips.pair(tv).await?;
            return Ok(PendingPair {
                tv: pending.tv.clone(),
                expires: pending.expires,
                philips: Some(pending),
            });
        }
        let detected = self.inspect(tv.ip).await?;
        if detected.protocol != tv.protocol {
            return Err("The TV at this address has changed. Search again.".into());
        }
        tv.name = detected.name;
        tv.secure = detected.secure;
        tv.mac = detected.mac.or(tv.mac);
        tv.mac = Some(format_mac(parse_mac(
            tv.mac
                .as_deref()
                .ok_or("Enter the TV's network MAC address.")?,
        )?));
        Ok(PendingPair {
            tv,
            expires: Instant::now() + Duration::from_secs(120),
            philips: None,
        })
    }
    pub async fn grant(&self, pending: &PendingPair, code: &str) -> Result<PairedTv> {
        if Instant::now() >= pending.expires {
            return Err("The pairing request expired. Connect the TV again.".into());
        }
        if let Some(philips) = &pending.philips {
            return self.philips.grant(philips, code).await;
        }
        // The TV can have changed addresses while the user was entering a key.
        if resolve_mac(pending.tv.ip).await != pending.tv.mac {
            return Err("The TV's network identity changed. Search again.".into());
        }
        let credentials = match pending.tv.protocol {
            TvProtocol::LgWebos | TvProtocol::SamsungTizen => websocket::pair(&pending.tv).await?,
            TvProtocol::SonyBravia => {
                if code.is_empty() || code.len() > 256 || code.chars().any(char::is_control) {
                    return Err(
                        "Enter the pre-shared key configured in the TV's IP control settings."
                            .into(),
                    );
                }
                // Public status reads do not verify the PSK. Pair while the TV is on and
                // validate control with an idempotent On command, never a power toggle.
                self.sony(
                    pending.tv.ip,
                    pending.tv.secure,
                    "setPowerStatus",
                    json!([{"status":true}]),
                    Some(code),
                )
                .await?;
                Credentials {
                    username: "Canapey".into(),
                    password: code.into(),
                }
            }
            TvProtocol::Roku => {
                self.roku(pending.tv.ip).await?;
                Credentials {
                    username: "local-network".into(),
                    password: "network-permission".into(),
                }
            }
            TvProtocol::Philips => unreachable!(),
        };
        let paired = PairedTv {
            tv: pending.tv.clone(),
            credentials,
            auto_wake: true,
            auto_standby: false,
        };
        paired.validate()?;
        Ok(paired)
    }
    pub async fn power(&self, tv: &PairedTv) -> Result<PowerState> {
        tv.validate()?;
        match tv.tv.protocol {
            TvProtocol::Philips => self.philips.power(tv).await,
            TvProtocol::LgWebos => websocket::lg_power(tv).await,
            TvProtocol::SamsungTizen => {
                let v = self.samsung(tv.tv.ip).await?;
                Ok(PowerState {
                    power: match v["device"]["PowerState"].as_str() {
                        Some("on") => Some("On".into()),
                        Some("standby") => Some("Standby".into()),
                        _ => None,
                    },
                    screen: None,
                })
            }
            TvProtocol::SonyBravia => {
                let v = self
                    .sony(
                        tv.tv.ip,
                        tv.tv.secure,
                        "getPowerStatus",
                        json!([]),
                        Some(&tv.credentials.password),
                    )
                    .await?;
                Ok(PowerState {
                    power: match v["result"][0]["status"].as_str() {
                        Some("active") => Some("On".into()),
                        Some("standby") => Some("Standby".into()),
                        _ => None,
                    },
                    screen: None,
                })
            }
            TvProtocol::Roku => Ok(self.roku(tv.tv.ip).await?.power()),
        }
    }
    async fn set_power(&self, tv: &PairedTv, on: bool) -> Result<()> {
        tv.validate()?;
        match tv.tv.protocol {
            TvProtocol::Philips => {
                if on {
                    self.philips.turn_on(tv).await
                } else {
                    self.philips.turn_off(tv).await
                }
            }
            TvProtocol::LgWebos | TvProtocol::SamsungTizen => websocket::set_power(tv, on).await,
            TvProtocol::SonyBravia => {
                self.sony(
                    tv.tv.ip,
                    tv.tv.secure,
                    "setPowerStatus",
                    json!([{"status":on}]),
                    Some(&tv.credentials.password),
                )
                .await?;
                Ok(())
            }
            TvProtocol::Roku => {
                self.text(
                    &format!(
                        "http://{}:8060/keypress/{}",
                        tv.tv.ip,
                        if on { "PowerOn" } else { "PowerOff" }
                    ),
                    None,
                    None,
                    true,
                )
                .await?;
                Ok(())
            }
        }
    }
    pub async fn turn_on(&self, tv: &PairedTv) -> Result<()> {
        self.set_power(tv, true).await
    }
    pub async fn turn_off(&self, tv: &PairedTv) -> Result<()> {
        self.set_power(tv, false).await
    }
}
fn valid_mac_value(value: Option<&str>) -> Option<String> {
    parse_mac(value?).ok().map(format_mac)
}
#[derive(Deserialize)]
#[serde(rename_all = "kebab-case")]
struct RokuInfo {
    #[serde(default)]
    is_tv: bool,
    #[serde(default)]
    user_device_name: String,
    #[serde(default)]
    model_name: String,
    #[serde(default)]
    network_type: String,
    #[serde(default)]
    wifi_mac: String,
    #[serde(default)]
    ethernet_mac: String,
    #[serde(default)]
    power_mode: String,
}
fn parse_roku(text: &str) -> Result<RokuInfo> {
    let info: RokuInfo =
        quick_xml::de::from_str(text).map_err(|_| "Invalid Roku device information.")?;
    if !info.is_tv {
        return Err("Roku streaming players are not supported as TVs.".into());
    }
    Ok(info)
}
impl RokuInfo {
    fn name(&self) -> String {
        if self.user_device_name.is_empty() {
            self.model_name.clone()
        } else {
            self.user_device_name.clone()
        }
    }
    fn mac(&self) -> Option<String> {
        valid_mac_value(match self.network_type.as_str() {
            "wifi" => Some(&self.wifi_mac),
            "ethernet" => Some(&self.ethernet_mac),
            _ => None,
        })
    }
    fn power(&self) -> PowerState {
        PowerState {
            power: match self.power_mode.as_str() {
                "PowerOn" | "DisplayOff" => Some("On".into()),
                "Ready" | "Headless" | "PowerOff" => Some("Standby".into()),
                _ => None,
            },
            screen: match self.power_mode.as_str() {
                "PowerOn" => Some("On".into()),
                "DisplayOff" => Some("Off".into()),
                _ => None,
            },
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn http_access_redirect_and_oversize_responses_are_not_success() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        for response in ["HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n", "HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:1/secret\r\nContent-Length: 0\r\n\r\n", "HTTP/1.1 200 OK\r\nContent-Length: 65537\r\n\r\n"] {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let address = listener.local_addr().unwrap();
            let server = tokio::spawn(async move {
                let (mut stream, _) = listener.accept().await.unwrap();
                let mut buffer = [0;4096]; let n = stream.read(&mut buffer).await.unwrap();
                let request = String::from_utf8_lossy(&buffer[..n]);
                assert!(request.starts_with("POST /sony/system "));
                assert!(request.to_ascii_lowercase().contains("x-auth-psk: synthetic"));
                stream.write_all(response.as_bytes()).await.unwrap();
            });
            let result = Client::new().unwrap().text(&format!("http://{address}/sony/system"), Some(&json!({"method":"setPowerStatus","params":[{"status":true}]})), Some("synthetic"), true).await;
            assert!(result.is_err()); server.await.unwrap();
        }
    }
    #[test]
    fn roku_tv_only_active_interface_and_screen_state() {
        assert!(parse_roku(
            "<device-info><is-tv>false</is-tv><power-mode>PowerOn</power-mode></device-info>"
        )
        .is_err());
        let tv = parse_roku("<device-info><is-tv>true</is-tv><network-type>ethernet</network-type><wifi-mac>02:11:22:33:44:55</wifi-mac><ethernet-mac>02:11:22:33:44:66</ethernet-mac><user-device-name>TCL &amp; family</user-device-name><power-mode>DisplayOff</power-mode></device-info>").unwrap();
        assert_eq!(tv.mac().as_deref(), Some("02:11:22:33:44:66"));
        assert_eq!(tv.name(), "TCL & family");
        assert!(!tv.power().screen_on());
        assert!(parse_roku("garbage").is_err());
    }
}
