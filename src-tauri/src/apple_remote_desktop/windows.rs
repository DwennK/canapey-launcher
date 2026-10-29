use super::Network;
use crate::apple_remote::{Error, Identity, Result};
use std::{ffi::CStr, net::Ipv4Addr, path::Path, sync::Arc};
use windows::Win32::{Networking::NetworkListManager::*, System::Com::*};
use windows_sys::Win32::{
    Foundation::LocalFree,
    NetworkManagement::{IpHelper::*, Ndis::IfOperStatusUp},
    Networking::WinSock::*,
    Security::Cryptography::*,
};

pub fn networks() -> std::result::Result<Vec<Network>, String> {
    unsafe {
        CoInitializeEx(None, COINIT_MULTITHREADED)
            .ok()
            .map_err(|_| "Windows networks unavailable.".to_string())?;
        struct Com;
        impl Drop for Com {
            fn drop(&mut self) {
                unsafe {
                    CoUninitialize();
                }
            }
        }
        let _com = Com;
        let manager: INetworkListManager = CoCreateInstance(&NetworkListManager, None, CLSCTX_ALL)
            .map_err(|_| "Network profiles unavailable.".to_string())?;
        let list = manager
            .GetNetworks(NLM_ENUM_NETWORK_CONNECTED)
            .map_err(|_| "Could not read networks.".to_string())?;
        let mut private = std::collections::BTreeSet::new();
        loop {
            let mut item = [None];
            let mut count = 0;
            list.Next(&mut item, Some(&mut count))
                .map_err(|_| "Could not enumerate networks.".to_string())?;
            if count == 0 {
                break;
            }
            let Some(network) = item[0].take() else { break };
            if network.GetCategory().ok() != Some(NLM_NETWORK_CATEGORY_PRIVATE) {
                continue;
            }
            let connections = network
                .GetNetworkConnections()
                .map_err(|_| "Network connections unavailable.".to_string())?;
            loop {
                let mut items = [None];
                let mut n = 0;
                connections
                    .Next(&mut items, Some(&mut n))
                    .map_err(|_| "Invalid network connection.".to_string())?;
                if n == 0 {
                    break;
                }
                if let Some(c) = items[0].take() {
                    if let Ok(id) = c.GetAdapterId() {
                        private.insert(format!("{id:?}").trim_matches(['{', '}']).to_lowercase());
                    }
                }
            }
        }
        let mut size = 16384;
        let mut buffer = vec![0u64; (size as usize).div_ceil(8)];
        let mut code = GetAdaptersAddresses(
            AF_INET as u32,
            GAA_FLAG_SKIP_ANYCAST | GAA_FLAG_SKIP_MULTICAST | GAA_FLAG_SKIP_DNS_SERVER,
            std::ptr::null(),
            buffer.as_mut_ptr().cast(),
            &mut size,
        );
        if code == 111 && size <= 1_048_576 {
            buffer.resize((size as usize).div_ceil(8), 0);
            code = GetAdaptersAddresses(
                AF_INET as u32,
                GAA_FLAG_SKIP_ANYCAST | GAA_FLAG_SKIP_MULTICAST | GAA_FLAG_SKIP_DNS_SERVER,
                std::ptr::null(),
                buffer.as_mut_ptr().cast(),
                &mut size,
            );
        }
        if code != 0 {
            return Err("Could not read network addresses.".into());
        }
        let mut adapter = buffer.as_ptr().cast::<IP_ADAPTER_ADDRESSES_LH>();
        let mut result = vec![];
        while !adapter.is_null() {
            let a = &*adapter;
            if !a.AdapterName.is_null() && a.OperStatus == IfOperStatusUp {
                let id = CStr::from_ptr(a.AdapterName.cast())
                    .to_string_lossy()
                    .trim_matches(['{', '}'])
                    .to_lowercase();
                if private.contains(&id) {
                    let label = if a.FriendlyName.is_null() {
                        "Private network".into()
                    } else {
                        let mut len = 0;
                        while *a.FriendlyName.add(len) != 0 && len < 256 {
                            len += 1;
                        }
                        String::from_utf16_lossy(std::slice::from_raw_parts(a.FriendlyName, len))
                    };
                    let mut unicast = a.FirstUnicastAddress;
                    while !unicast.is_null() {
                        let u = &*unicast;
                        let addr = u.Address.lpSockaddr;
                        if !addr.is_null()
                            && (*addr).sa_family == AF_INET
                            && u.Address.iSockaddrLength as usize
                                >= std::mem::size_of::<SOCKADDR_IN>()
                        {
                            let v4 = &*addr.cast::<SOCKADDR_IN>();
                            let ip = Ipv4Addr::from(v4.sin_addr.S_un.S_addr.to_ne_bytes());
                            if !ip.is_loopback() && !ip.is_unspecified() && !ip.is_link_local() {
                                result.push(Network {
                                    id: id.clone(),
                                    label: label.clone(),
                                    address: ip.to_string(),
                                });
                            }
                        }
                        unicast = u.Next;
                    }
                }
            }
            adapter = a.Next;
        }
        result.sort_by(|a, b| (&a.id, &a.address).cmp(&(&b.id, &b.address)));
        result.dedup_by(|a, b| a.id == b.id);
        Ok(result)
    }
}
fn protect(data: &[u8], encrypt: bool) -> Result<Vec<u8>> {
    if data.len() > 65536 {
        return Err(Error::Storage);
    }
    unsafe {
        let input = CRYPT_INTEGER_BLOB {
            cbData: data.len() as u32,
            pbData: data.as_ptr().cast_mut(),
        };
        let mut output: CRYPT_INTEGER_BLOB = std::mem::zeroed();
        let ok = if encrypt {
            CryptProtectData(
                &input,
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        } else {
            CryptUnprotectData(
                &input,
                std::ptr::null_mut(),
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        };
        if ok == 0 {
            return Err(Error::Storage);
        }
        let result = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        if !encrypt {
            use zeroize::Zeroize;
            std::slice::from_raw_parts_mut(output.pbData, output.cbData as usize).zeroize();
        }
        LocalFree(output.pbData.cast());
        Ok(result)
    }
}
pub fn identity(path: &Path) -> Result<Identity> {
    if path.exists() {
        if std::fs::metadata(path)?.len() > 65_536 {
            return Err(Error::Storage);
        }
        let bytes = std::fs::read(path)?;
        let plain = zeroize::Zeroizing::new(protect(&bytes, false)?);
        let id: Identity = serde_json::from_slice(&plain).map_err(|_| Error::Storage)?;
        id.validate()?;
        Ok(id)
    } else {
        let id = Identity::new();
        save(path, &id)?;
        Ok(id)
    }
}
fn save(path: &Path, identity: &Identity) -> Result<()> {
    use std::io::Write;
    let plain = zeroize::Zeroizing::new(serde_json::to_vec(identity).map_err(|_| Error::Storage)?);
    let sealed = protect(&plain, true)?;
    let parent = path.parent().ok_or(Error::Storage)?;
    std::fs::create_dir_all(parent)?;
    let mut file = tempfile::NamedTempFile::new_in(parent)?;
    file.write_all(&sealed)?;
    file.as_file().sync_all()?;
    file.persist(path).map_err(|_| Error::Storage)?;
    Ok(())
}
pub fn persistence(path: std::path::PathBuf) -> crate::apple_remote::Persist {
    Arc::new(move |identity| save(&path, identity))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn dpapi_round_trip_corruption_and_revocation_persist() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("identity.dpapi");
        let mut first = identity(&path).unwrap();
        first.clients.insert("phone".into(), [7; 32]);
        save(&path, &first).unwrap();
        let restored = identity(&path).unwrap();
        assert_eq!(first.id, restored.id);
        assert_eq!(restored.clients.len(), 1);
        first.clients.clear();
        save(&path, &first).unwrap();
        assert!(identity(&path).unwrap().clients.is_empty());
        std::fs::write(&path, b"invalid").unwrap();
        assert!(identity(&path).is_err());
    }
}
