//! Local TV pairing and network power. No UI or Windows lifecycle dependency.
mod multibrand;
mod network;
mod protocol;
mod websocket;
pub use multibrand::{Client, PendingPair};
pub use network::{discover, resolve_mac, send_wol};
use serde::{Deserialize, Serialize};
use std::net::Ipv4Addr;

pub type Result<T> = std::result::Result<T, String>;
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Television {
    #[serde(default)]
    pub protocol: TvProtocol,
    #[serde(default = "secure_default")]
    pub secure: bool,
    pub name: String,
    pub ip: Ipv4Addr,
    pub mac: Option<String>,
}
fn secure_default() -> bool {
    true
}
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TvProtocol {
    #[default]
    Philips,
    LgWebos,
    SamsungTizen,
    SonyBravia,
    Roku,
}
impl TvProtocol {
    pub fn pairing_mode(self) -> &'static str {
        match self {
            Self::Philips => "pin",
            Self::LgWebos | Self::SamsungTizen => "approval",
            Self::SonyBravia => "psk",
            Self::Roku => "network",
        }
    }
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
    #[serde(default)]
    pub hdmi_port: Option<u8>,
}
impl PairedTv {
    pub fn validate(&self) -> Result<()> {
        self.tv.validate()?;
        if let Some(port) = self.hdmi_port {
            let max = match self.tv.protocol {
                TvProtocol::SamsungTizen => 0,
                TvProtocol::Philips | TvProtocol::Roku => 4,
                TvProtocol::LgWebos | TvProtocol::SonyBravia => 8,
            };
            if !(1..=max).contains(&port) {
                return Err("This HDMI input is unavailable.".into());
            }
        }
        parse_mac(
            self.tv
                .mac
                .as_deref()
                .ok_or("Enter the TV's network MAC address.")?,
        )?;
        if self.credentials.username.is_empty()
            || self.credentials.username.len() > 128
            || self.credentials.password.is_empty()
            || self.credentials.password.len() > 4096
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
    pub fn confirms_on(&self, protocol: TvProtocol) -> bool {
        if matches!(protocol, TvProtocol::SamsungTizen | TvProtocol::SonyBravia) {
            self.power.as_deref() == Some("On")
        } else {
            self.screen_on()
        }
    }
    pub fn screen_on(&self) -> bool {
        self.power.as_deref() == Some("On") && self.screen.as_deref() == Some("On")
    }
}

#[derive(Clone, Copy, Debug)]
pub enum WakeEvent {
    PacketSent,
    Reachable,
    PowerConfirmed(Ipv4Addr),
    InputSent,
}

#[derive(Clone, Copy, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WakeProgress {
    pub packet_sent: bool,
    pub reachable: bool,
    pub power_confirmed: bool,
    pub input_sent: bool,
    pub retry_input: bool,
    #[serde(skip)]
    pub confirmed_ip: Option<Ipv4Addr>,
}
impl WakeProgress {
    pub fn record(&mut self, event: WakeEvent) {
        match event {
            WakeEvent::PacketSent => self.packet_sent = true,
            WakeEvent::Reachable => self.reachable = true,
            WakeEvent::PowerConfirmed(ip) => {
                self.power_confirmed = true;
                self.confirmed_ip = Some(ip);
            }
            WakeEvent::InputSent => self.input_sent = true,
        }
    }
    pub fn timeout_message(&self) -> &'static str {
        if self.power_confirmed {
            "The TV is on, but the HDMI switch failed. Check the input and TV permissions."
        } else if self.reachable {
            "The TV did not confirm it was on. Check the TV's network wake setting and try again."
        } else if self.packet_sent {
            "Wake packet sent. The paired TV did not respond on the local network."
        } else {
            "No wake packet could be sent. Check the PC’s network connection."
        }
    }
}

/// Wake is bounded by the caller. Repeated power commands are absolute On, never a toggle.
/// Credentials are sent only after matching the paired MAC (including after DHCP changes).
pub async fn wake(
    client: &Client,
    paired: &mut PairedTv,
    mut progress: impl FnMut(WakeEvent),
) -> Result<PowerState> {
    paired.validate()?;
    let mac = paired
        .tv
        .mac
        .clone()
        .ok_or("Enter the TV's network MAC address.")?;
    let mut attempts = 0;
    loop {
        if send_wol(&mac).await.is_ok() {
            progress(WakeEvent::PacketSent);
        }
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        if resolve_mac(paired.tv.ip).await.as_deref() == Some(&mac) {
            let response = client.power(paired).await;
            if response.is_ok()
                || response
                    .as_ref()
                    .is_err_and(|e| e.contains("rejected this pairing"))
            {
                progress(WakeEvent::Reachable);
            }
            match response {
                Ok(power) if power.confirms_on(paired.tv.protocol) => {
                    progress(WakeEvent::PowerConfirmed(paired.tv.ip));
                    if let Some(port) = paired.hdmi_port {
                        client.switch_hdmi(paired, port).await.map_err(|_| "The TV is on, but the HDMI switch failed. Check the input and TV permissions.")?;
                        progress(WakeEvent::InputSent);
                    }
                    return Ok(power);
                }
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
                if let Some(tv) = tvs
                    .into_iter()
                    .find(|tv| tv.mac.as_deref() == Some(&mac) && tv.protocol == paired.tv.protocol)
                {
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
    fn wake_timeout_explains_the_last_confirmed_step() {
        let mut progress = WakeProgress::default();
        assert!(progress.timeout_message().contains("No wake packet"));
        progress.record(WakeEvent::PacketSent);
        assert!(progress.timeout_message().contains("did not respond"));
        progress.record(WakeEvent::Reachable);
        assert!(progress
            .timeout_message()
            .contains("did not confirm it was on"));
        let ip = Ipv4Addr::new(192, 168, 1, 2);
        progress.record(WakeEvent::PowerConfirmed(ip));
        assert_eq!(progress.confirmed_ip, Some(ip));
        assert!(progress.timeout_message().contains("HDMI"));
        assert!(!progress.input_sent);
        progress.record(WakeEvent::InputSent);
        assert!(progress.input_sent);
    }
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
        assert_eq!(paired.hdmi_port, None);
        assert_eq!(paired.tv.protocol, TvProtocol::Philips);
        assert!(paired.tv.secure);
    }
    #[test]
    fn saved_hdmi_port_is_scoped_to_the_paired_family() {
        let mut paired: PairedTv = serde_json::from_value(serde_json::json!({
            "tv":{"name":"TV","ip":"192.168.1.20","mac":"02:11:22:33:44:55","protocol":"roku"},
            "credentials":{"username":"test","password":"test"}, "autoWake":false, "hdmiPort":2
        }))
        .unwrap();
        paired.validate().unwrap();
        assert_eq!(serde_json::to_value(&paired).unwrap()["hdmiPort"], 2);
        paired.hdmi_port = Some(5);
        assert!(paired.validate().is_err());
        paired.tv.protocol = TvProtocol::SonyBravia;
        paired.validate().unwrap();
        paired.tv.protocol = TvProtocol::SamsungTizen;
        assert!(paired.validate().is_err());
        paired.hdmi_port = None;
        paired.validate().unwrap();
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
    fn protocol_specific_confirmation_preserves_unknown_screen_state() {
        let power = PowerState {
            power: Some("On".into()),
            screen: None,
        };
        assert!(power.confirms_on(TvProtocol::SamsungTizen));
        assert!(power.confirms_on(TvProtocol::SonyBravia));
        assert!(!power.screen_on());
        for protocol in [TvProtocol::Philips, TvProtocol::LgWebos, TvProtocol::Roku] {
            assert!(!power.confirms_on(protocol));
        }
        for protocol in [
            TvProtocol::Philips,
            TvProtocol::LgWebos,
            TvProtocol::SamsungTizen,
            TvProtocol::SonyBravia,
            TvProtocol::Roku,
        ] {
            assert!(!PowerState::default().confirms_on(protocol));
        }
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
