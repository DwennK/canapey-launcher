use super::*;
use base64::{engine::general_purpose::STANDARD, Engine};
use hmac::{Hmac, Mac};
use reqwest::{Client as HttpClient, Method, StatusCode};
use serde_json::{json, Value};
use sha1::Sha1;
use std::time::{Duration, Instant};

// Public jointSPACE protocol key, not a user credential. See ha-philipsjs.
const SHARED_KEY: &str =
    "ZmVay1EQVFOaZhwQ4Kv81ypLAZNczV9sG4KkseXWn1NEk6cXmPKO/MCa9sryslvLCFMnNe4Z4CPXzToowvhHvA==";
const LIMIT: usize = 65_536;
pub struct PendingPair {
    pub tv: Television,
    pub expires: Instant,
    device: Value,
    timestamp: Value,
    credentials: Credentials,
}
#[derive(Clone)]
pub struct Client {
    http: HttpClient,
}
impl Client {
    pub fn new() -> Result<Self> {
        // Philips uses self-signed certificates. This client only accepts literal private IPv4
        // addresses, fixed ports, no redirects/proxies, and verifies MAC identity before auth.
        let http = HttpClient::builder()
            .danger_accept_invalid_certs(true)
            .redirect(reqwest::redirect::Policy::none())
            .no_proxy()
            .connect_timeout(Duration::from_secs(2))
            .timeout(Duration::from_secs(4))
            .build()
            .map_err(|_| "Could not start the TV connection.")?;
        Ok(Self { http })
    }
    async fn request(
        &self,
        ip: Ipv4Addr,
        endpoint: &str,
        body: Option<Value>,
        credentials: Option<&Credentials>,
    ) -> Result<Value> {
        local_ip(&ip.to_string())?;
        let path = format!("/6/{endpoint}");
        let url = format!("https://{ip}:1926{path}");
        let method = if body.is_some() {
            Method::POST
        } else {
            Method::GET
        };
        let bytes = body.map(|b| serde_json::to_vec(&b).unwrap_or_default());
        let build = || {
            let r = self.http.request(method.clone(), &url);
            if let Some(bytes) = &bytes {
                r.header("Content-Type", "application/json")
                    .body(bytes.clone())
            } else {
                r
            }
        };
        let mut response = build()
            .send()
            .await
            .map_err(|_| "The TV is not responding. Check its network connection.")?;
        if response.status() == StatusCode::UNAUTHORIZED {
            let creds = credentials.ok_or("Pair this TV before controlling it.")?;
            let challenge = response
                .headers()
                .get("www-authenticate")
                .and_then(|v| v.to_str().ok())
                .ok_or("The TV did not provide an authentication challenge.")?;
            let mut prompt = digest_auth::parse(challenge)
                .map_err(|_| "The TV authentication challenge is not supported.")?;
            let context = if let Some(bytes) = &bytes {
                digest_auth::AuthContext::new_post(
                    &creds.username,
                    &creds.password,
                    &path,
                    Some(bytes.as_slice()),
                )
            } else {
                digest_auth::AuthContext::new(&creds.username, &creds.password, &path)
            };
            let auth = prompt
                .respond(&context)
                .map_err(|_| "Could not authenticate with the TV.")?
                .to_string();
            response = build()
                .header("Authorization", auth)
                .send()
                .await
                .map_err(|_| "The TV is not responding. Check its network connection.")?;
        }
        if response.status() == StatusCode::UNAUTHORIZED
            || response.status() == StatusCode::FORBIDDEN
        {
            return Err("The TV rejected this pairing. Pair it again in Controls → TV.".into());
        }
        if !response.status().is_success() {
            return Err(
                "This TV command is unavailable. Check that the TV supports Philips jointSPACE v6."
                    .into(),
            );
        }
        if response.content_length().is_some_and(|n| n > LIMIT as u64) {
            return Err("The TV response is too large.".into());
        }
        let mut data = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| "Could not read the TV response.")?
        {
            if data.len() + chunk.len() > LIMIT {
                return Err("The TV response is too large.".into());
            }
            data.extend_from_slice(&chunk);
        }
        if data.is_empty() {
            return Ok(Value::Null);
        }
        serde_json::from_slice(&data).map_err(|_| "The TV returned an unexpected response.".into())
    }
    async fn system(&self, ip: Ipv4Addr) -> Result<Value> {
        let system = self.request(ip, "system", None, None).await?;
        if system["api_version"]["Major"] != 6
            || system["featuring"]["systemfeatures"]["pairing_type"] != "digest_auth_pairing"
        {
            return Err("This TV does not support Philips PIN pairing (jointSPACE v6).".into());
        }
        Ok(system)
    }
    pub async fn inspect(&self, ip: Ipv4Addr) -> Result<Television> {
        let system = self.system(ip).await?;
        let tv = Television {
            name: system["name"].as_str().unwrap_or("Philips TV").to_owned(),
            ip,
            mac: resolve_mac(ip).await,
        };
        tv.validate()?;
        Ok(tv)
    }
    pub async fn pair(&self, mut tv: Television) -> Result<PendingPair> {
        tv.validate()?;
        let system = self.system(tv.ip).await?;
        // Resolve from the live interface; a manually supplied MAC is a fallback only.
        if let Some(mac) = resolve_mac(tv.ip).await {
            tv.mac = Some(mac);
        }
        tv.mac = Some(format_mac(parse_mac(
            tv.mac
                .as_deref()
                .ok_or("Enter the TV's network MAC address.")?,
        )?));
        tv.name = system["name"].as_str().unwrap_or("Philips TV").to_owned();
        tv.validate()?;
        let id = uuid::Uuid::new_v4().simple().to_string();
        let device = json!({"device_name":"Canapey Launcher","device_os":"Windows","type":"native","id":id,"app_id":"canapey.tv","app_name":"Canapey Launcher"});
        let data = json!({"access":{"scope":["read","write","control"],"featuring":system["featuring"]},"device":device});
        let result = self
            .request(tv.ip, "pair/request", Some(data), None)
            .await?;
        if result["error_id"] != "SUCCESS" {
            return Err("The TV could not start pairing. Turn it on and try again.".into());
        }
        let key = result["auth_key"]
            .as_str()
            .filter(|s| !s.is_empty() && s.len() <= 256)
            .ok_or("The TV returned an invalid pairing response.")?
            .to_owned();
        if !result["timestamp"].is_number() {
            return Err("The TV returned an invalid pairing response.".into());
        }
        let seconds = result["timeout"].as_u64().unwrap_or(60).clamp(1, 120);
        Ok(PendingPair {
            tv,
            expires: Instant::now() + Duration::from_secs(seconds),
            device,
            timestamp: result["timestamp"].clone(),
            credentials: Credentials {
                username: id,
                password: key,
            },
        })
    }
    pub async fn grant(&self, pending: &PendingPair, pin: &str) -> Result<PairedTv> {
        if Instant::now() >= pending.expires {
            return Err("The pairing code expired. Request a new code.".into());
        }
        if pin.len() != 4 || !pin.bytes().all(|b| b.is_ascii_digit()) {
            return Err("Enter the four-digit code shown on your TV.".into());
        }
        let signature = signature(&pending.timestamp.to_string(), pin);
        let data = json!({"auth":{"auth_appId":"1","auth_timestamp":pending.timestamp,"auth_signature":signature,"pin":pin},"device":pending.device});
        let result = self
            .request(
                pending.tv.ip,
                "pair/grant",
                Some(data),
                Some(&pending.credentials),
            )
            .await?;
        if result["error_id"] != "SUCCESS" {
            return Err("The TV rejected the code. Check it or request a new code.".into());
        }
        Ok(PairedTv {
            tv: pending.tv.clone(),
            credentials: pending.credentials.clone(),
            auto_wake: true,
            auto_standby: false,
        })
    }
    pub async fn power(&self, tv: &PairedTv) -> Result<PowerState> {
        let power = self
            .request(tv.tv.ip, "powerstate", None, Some(&tv.credentials))
            .await?;
        let screen = self
            .request(tv.tv.ip, "screenstate", None, Some(&tv.credentials))
            .await?;
        Ok(PowerState {
            power: power["powerstate"].as_str().map(str::to_owned),
            screen: screen["screenstate"].as_str().map(str::to_owned),
        })
    }
    pub async fn turn_off(&self, tv: &PairedTv) -> Result<()> {
        self.request(
            tv.tv.ip,
            "powerstate",
            Some(json!({"powerstate":"Standby"})),
            Some(&tv.credentials),
        )
        .await?;
        Ok(())
    }
    pub async fn turn_on(&self, tv: &PairedTv) -> Result<()> {
        self.request(
            tv.tv.ip,
            "powerstate",
            Some(json!({"powerstate":"On"})),
            Some(&tv.credentials),
        )
        .await?;
        Ok(())
    }
}
fn signature(timestamp: &str, pin: &str) -> String {
    let key = STANDARD.decode(SHARED_KEY).expect("Protocol key");
    let mut hmac = Hmac::<Sha1>::new_from_slice(&key).expect("HMAC key");
    hmac.update(timestamp.as_bytes());
    hmac.update(pin.as_bytes());
    STANDARD.encode(hmac.finalize().into_bytes())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn invalid_or_expired_pin_is_rejected_before_any_network_request() {
        let mut pending = PendingPair {
            tv: Television {
                name: "Test TV".into(),
                ip: "192.168.1.20".parse().unwrap(),
                mac: Some("AA:BB:CC:DD:EE:02".into()),
            },
            expires: Instant::now() + Duration::from_secs(60),
            device: json!({}),
            timestamp: json!(1234),
            credentials: Credentials {
                username: "synthetic".into(),
                password: "synthetic".into(),
            },
        };
        let client = Client::new().unwrap();
        for pin in ["", "123", "12345", "1e03", "１２３４"] {
            assert!(
                matches!(client.grant(&pending, pin).await, Err(e) if e.contains("four-digit"))
            );
        }
        pending.expires = Instant::now();
        assert!(matches!(client.grant(&pending, "0042").await, Err(e) if e.contains("expired")));
    }
    #[test]
    fn pin_signature_matches_jointspace_vector() {
        // Independently calculated with Python's hmac/sha1; synthetic PIN and timestamp.
        assert_eq!(
            signature("1234567890", "1234"),
            "Pxx8BFq8+uUVEByex/1rFkqOZMQ="
        );
    }
}
