//! Philips jointSPACE v6 pairing and network wake. No UI or Windows lifecycle dependency.
mod network;
mod protocol;
pub use network::{discover, resolve_mac, send_wol};
pub use protocol::{Client, PendingPair};
use serde::{Deserialize, Serialize};
use std::net::Ipv4Addr;

pub type Result<T> = std::result::Result<T, String>;
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Television {
    pub name: String,
    pub ip: Ipv4Addr,
    pub mac: Option<String>,
}
impl Television {
    pub fn validate(&self) -> Result<()> {
        local_ip(&self.ip.to_string())?;
        if self.name.is_empty() || self.name.len() > 160 || self.name.chars().any(char::is_control)
        {
            return Err("The TV returned an invalid name.".into());
        }
        if let Some(mac) = &self.mac {
            parse_mac(mac)?;
        }
        Ok(())
    }
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Credentials {
    pub username: String,
    pub password: String,
}
impl Drop for Credentials {
    fn drop(&mut self) {
        use zeroize::Zeroize;
        self.username.zeroize();
        self.password.zeroize();
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairedTv {
    pub tv: Television,
    pub credentials: Credentials,
    pub auto_wake: bool,
    #[serde(default)]
    pub auto_standby: bool,
}
impl PairedTv {
    pub fn validate(&self) -> Result<()> {
        self.tv.validate()?;
        parse_mac(
            self.tv
                .mac
                .as_deref()
                .ok_or("Enter the TV's network MAC address.")?,
        )?;
        if self.credentials.username.is_empty()
            || self.credentials.username.len() > 128
            || self.credentials.password.is_empty()
            || self.credentials.password.len() > 256
        {
            return Err("The saved TV pairing is invalid. Pair the TV again.".into());
        }
        Ok(())
    }
}
pub fn local_ip(value: &str) -> Result<Ipv4Addr> {
    let ip: Ipv4Addr = value
        .trim()
        .parse()
        .map_err(|_| "Enter a local IPv4 address, such as 192.168.1.20.")?;
    if !(ip.is_private() || ip.is_link_local()) || ip.octets()[3] == 255 {
        return Err("Use the TV's private local IPv4 address.".into());
    }
    Ok(ip)
}
pub fn parse_mac(value: &str) -> Result<[u8; 6]> {
    let text = value.trim().replace('-', ":");
    let parts: Vec<_> = text.split(':').collect();
    let mut bytes = [0; 6];
    if parts.len() != 6 {
        return Err("Enter a MAC address such as AA:BB:CC:DD:EE:FF.".into());
    }
    for (i, part) in parts.iter().enumerate() {
        if part.len() != 2 {
            return Err("Enter a MAC address such as AA:BB:CC:DD:EE:FF.".into());
        }
        bytes[i] = u8::from_str_radix(part, 16).map_err(|_| "Enter a valid MAC address.")?;
    }
    if bytes == [0; 6] || bytes[0] & 1 != 0 {
        return Err("Use the TV's unicast network MAC address.".into());
    }
    Ok(bytes)
}
pub fn format_mac(bytes: [u8; 6]) -> String {
    bytes
        .iter()
        .map(|v| format!("{v:02X}"))
        .collect::<Vec<_>>()
        .join(":")
}
pub fn magic_packet(mac: [u8; 6]) -> [u8; 102] {
    let mut packet = [0xff; 102];
    for chunk in packet[6..].as_chunks_mut::<6>().0 {
        chunk.copy_from_slice(&mac);
    }
    packet
}
#[derive(Clone, Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PowerState {
    pub power: Option<String>,
    pub screen: Option<String>,
}
impl PowerState {
    pub fn screen_on(&self) -> bool {
        self.power.as_deref() == Some("On") && self.screen.as_deref() == Some("On")
    }
}

/// Wake is bounded by the caller. Repeated power commands are absolute On, never a toggle.
/// Credentials are sent only after matching the paired MAC (including after DHCP changes).
pub async fn wake(client: &Client, paired: &mut PairedTv) -> Result<PowerState> {
    paired.validate()?;
    let mac = paired
        .tv
        .mac
        .clone()
        .ok_or("Enter the TV's network MAC address.")?;
    let mut attempts = 0;
    loop {
        let _ = send_wol(&mac).await;
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        if resolve_mac(paired.tv.ip).await.as_deref() == Some(&mac) {
            match client.power(paired).await {
                Ok(power) if power.screen_on() => return Ok(power),
                Ok(_) => {
                    if let Err(e) = client.turn_on(paired).await {
                        if e.contains("rejected this pairing") {
                            return Err(e);
                        }
                        // Network/API availability can fluctuate immediately after wake.
                    }
                }
                Err(e) if e.contains("rejected this pairing") => return Err(e),
                Err(_) => {}
            }
        }
        attempts += 1;
        if attempts % 4 == 0 {
            if let Ok(tvs) = discover(client).await {
                if let Some(tv) = tvs.into_iter().find(|tv| tv.mac.as_deref() == Some(&mac)) {
                    paired.tv = tv;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn missing_standby_preference_never_enables_automatic_power_off() {
        let value = serde_json::json!({
            "tv": {"name":"Test TV", "ip":"192.168.1.20", "mac":"AA:BB:CC:DD:EE:02"},
            "credentials":{"username":"synthetic", "password":"synthetic"}, "autoWake":true
        });
        let paired: PairedTv = serde_json::from_value(value).unwrap();
        paired.validate().unwrap();
        assert!(paired.auto_wake);
        assert!(!paired.auto_standby);
    }
    #[test]
    fn validates_local_targets_and_wol_bytes() {
        for ip in [
            "127.0.0.1",
            "8.8.8.8",
            "::1",
            "192.168.1.255",
            "http://192.168.1.2",
            "localhost",
        ] {
            assert!(local_ip(ip).is_err());
        }
        assert!(local_ip("192.168.1.20").is_ok());
        for mac in [
            "00:00:00:00:00:00",
            "FF:FF:FF:FF:FF:FF",
            "01:02:03:04:05:06",
            "AA:BB:CC:DD:EE",
            "a:b:c:d:e:f",
        ] {
            assert!(parse_mac(mac).is_err());
        }
        let mac = parse_mac("02-11-22-33-44-55").unwrap();
        let packet = magic_packet(mac);
        assert_eq!(&packet[..6], &[255; 6]);
        assert!(packet[6..].chunks_exact(6).all(|v| v == mac));
    }
    #[test]
    fn network_or_power_on_does_not_prove_screen_on() {
        assert!(!PowerState {
            power: Some("On".into()),
            screen: Some("Off".into())
        }
        .screen_on());
        assert!(!PowerState {
            power: Some("On".into()),
            screen: None
        }
        .screen_on());
        assert!(PowerState {
            power: Some("On".into()),
            screen: Some("On".into())
        }
        .screen_on());
    }
}
