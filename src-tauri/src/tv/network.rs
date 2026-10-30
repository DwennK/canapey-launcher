use super::*;
use std::{
    collections::BTreeSet,
    net::IpAddr,
    time::{Duration, Instant},
};
use tokio::net::UdpSocket;

fn interfaces() -> Vec<if_addrs::Ifv4Addr> {
    if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|i| match i.addr {
            if_addrs::IfAddr::V4(v) if local_ip(&v.ip.to_string()).is_ok() => Some(v),
            _ => None,
        })
        .collect()
}
pub async fn send_wol(mac: &str) -> Result<()> {
    let packet = magic_packet(parse_mac(mac)?);
    let mut sent = false;
    for interface in interfaces() {
        let Ok(socket) = UdpSocket::bind((interface.ip, 0)).await else {
            continue;
        };
        if socket.set_broadcast(true).is_err() {
            continue;
        }
        for target in [
            interface.broadcast.unwrap_or(Ipv4Addr::BROADCAST),
            Ipv4Addr::BROADCAST,
        ] {
            for port in [9, 7] {
                sent |= socket.send_to(&packet, (target, port)).await.is_ok();
            }
        }
    }
    if sent {
        Ok(())
    } else {
        Err("No local network is available. Connect the PC and TV to the same network.".into())
    }
}
async fn ssdp() -> Vec<Ipv4Addr> {
    let mut jobs = tokio::task::JoinSet::new();
    for interface in interfaces() {
        jobs.spawn(async move {
            let mut found=BTreeSet::new();
            let Ok(socket)=UdpSocket::bind((interface.ip,0)).await else{return found};
            let packet=b"M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 2\r\nST: ssdp:all\r\n\r\n";
            let _=socket.send_to(packet,(Ipv4Addr::new(239,255,255,250),1900)).await;
            let deadline=tokio::time::Instant::now()+Duration::from_secs(4);
            let mut buf=[0;8192];
            while let Ok(Ok((n,source)))=tokio::time::timeout_at(deadline,socket.recv_from(&mut buf)).await {
                // Do not follow LOCATION URLs supplied by arbitrary LAN devices.
                if let IpAddr::V4(ip)=source.ip() {
                    let text=String::from_utf8_lossy(&buf[..n]).to_ascii_lowercase();
                    if text.starts_with("http/1.1 200") && (text.contains("philips") || text.contains("chromecast"))
                        && local_ip(&ip.to_string()).is_ok() {found.insert(ip);}
                }
                if found.len()>=32 {break;}
            }
            found
        });
    }
    let mut found = BTreeSet::new();
    while let Some(Ok(ips)) = jobs.join_next().await {
        found.extend(ips);
    }
    found.into_iter().take(32).collect()
}
async fn mdns() -> Vec<Ipv4Addr> {
    tokio::task::spawn_blocking(|| {
        let mut found = BTreeSet::new();
        let Ok(daemon) = mdns_sd::ServiceDaemon::new() else {
            return Vec::new();
        };
        if let Ok(receiver) = daemon.browse("_googlecast._tcp.local.") {
            let end = Instant::now() + Duration::from_secs(4);
            while let Some(remaining) = end.checked_duration_since(Instant::now()) {
                let Ok(event) = receiver.recv_timeout(remaining) else {
                    break;
                };
                if let mdns_sd::ServiceEvent::ServiceResolved(info) = event {
                    for ip in info.get_addresses_v4() {
                        if local_ip(&ip.to_string()).is_ok() {
                            found.insert(ip);
                        }
                    }
                }
                if found.len() >= 32 {
                    break;
                }
            }
        }
        let _ = daemon.shutdown();
        found.into_iter().take(32).collect()
    })
    .await
    .unwrap_or_default()
}
pub async fn discover(client: &Client) -> Result<Vec<Television>> {
    if interfaces().is_empty() {
        return Err(
            "No local network is available. Connect the PC and TV to the same network.".into(),
        );
    }
    let (a, b) = tokio::join!(ssdp(), mdns());
    let ips: BTreeSet<_> = a.into_iter().chain(b).collect();
    let mut results = Vec::new();
    // Bounded batches avoid holding an unbounded number of connections open.
    let mut jobs = tokio::task::JoinSet::new();
    for ip in ips.into_iter().take(32) {
        let client = client.clone();
        jobs.spawn(async move { client.inspect(ip).await });
    }
    while let Some(result) = jobs.join_next().await {
        if let Ok(Ok(tv)) = result {
            results.push(tv);
        }
    }
    results.sort_by(|a, b| (&a.name, a.ip).cmp(&(&b.name, b.ip)));
    Ok(results)
}
pub async fn resolve_mac(ip: Ipv4Addr) -> Option<String> {
    if local_ip(&ip.to_string()).is_err() {
        return None;
    }
    tokio::task::spawn_blocking(move || platform_mac(ip))
        .await
        .ok()
        .flatten()
}
#[cfg(windows)]
fn platform_mac(ip: Ipv4Addr) -> Option<String> {
    use windows_sys::Win32::NetworkManagement::IpHelper::SendARP;
    let mut bytes = [0u8; 8];
    let mut len = bytes.len() as u32;
    let result = unsafe {
        SendARP(
            u32::from_ne_bytes(ip.octets()),
            0,
            bytes.as_mut_ptr().cast(),
            &mut len,
        )
    };
    if result != 0 || len != 6 {
        return None;
    }
    let value = format_mac(bytes[..6].try_into().ok()?);
    parse_mac(&value).ok().map(|_| value)
}
#[cfg(not(windows))]
fn platform_mac(ip: Ipv4Addr) -> Option<String> {
    // Used by the opt-in network probe on macOS; the shipping integration is Windows-only.
    let output = std::process::Command::new("/usr/sbin/arp")
        .arg("-an")
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    mac_from_arp(&text, ip)
}
#[cfg(any(not(windows), test))]
fn mac_from_arp(text: &str, ip: Ipv4Addr) -> Option<String> {
    // macOS lookup of one host may omit scoped entries; inspect the complete cache.
    let marker = format!("({ip}) at ");
    let values: BTreeSet<_> = text
        .lines()
        .filter_map(|line| {
            let mac = line.split_once(&marker)?.1.split_whitespace().next()?;
            parse_arp_mac(mac)
        })
        .collect();
    if values.len() != 1 {
        return None;
    }
    values.into_iter().next()
}
#[cfg(any(not(windows), test))]
fn parse_arp_mac(mac: &str) -> Option<String> {
    let parts: Option<Vec<u8>> = mac
        .split(':')
        .map(|p| u8::from_str_radix(p, 16).ok())
        .collect();
    let bytes: [u8; 6] = parts?.try_into().ok()?;
    let value = format_mac(bytes);
    parse_mac(&value).ok().map(|_| value)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn scoped_arp_and_short_octets_without_matching_other_hosts() {
        let ip = "192.168.1.20".parse().unwrap();
        let cache = "? (192.168.1.200) at aa:bb:cc:dd:ee:ff on en1\n? (192.168.1.20) at d4:ab:c:0:ee:37 on en0 ifscope [ethernet]";
        assert_eq!(
            mac_from_arp(cache, ip).as_deref(),
            Some("D4:AB:0C:00:EE:37")
        );
        assert!(mac_from_arp("? (192.168.1.20) at (incomplete) on en0", ip).is_none());
        assert!(mac_from_arp(
            &format!("{cache}\n? (192.168.1.20) at aa:bb:cc:dd:ee:ff on en1"),
            ip
        )
        .is_none());
    }
}
