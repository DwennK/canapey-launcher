use url::Url;

pub fn address(value: &str) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|_| "Invalid Silo address.")?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || matches!(
            url.host_str(),
            Some("tauri.localhost" | "asset.localhost" | "ipc.localhost")
        )
    {
        return Err("Invalid Silo address.".into());
    }
    Ok(url)
}

#[cfg(any(windows, test))]
pub fn allows_navigation(origin: &url::Origin, next: &Url) -> bool {
    next.as_str() == "about:blank"
        || (matches!(next.scheme(), "http" | "https") && next.origin() == *origin)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn server_policy_accepts_a_lan_address_and_rejects_credentials_and_internal_protocols() {
        assert!(address("http://192.168.1.4:8090/web/").is_ok());
        for raw in [
            "file:///silo",
            "http://ipc.localhost/",
            "https://user:password@server/",
            "https://server/?token=x",
            "http://tauri.localhost/",
            "javascript:void(0)",
        ] {
            assert!(address(raw).is_err(), "{raw}");
        }
    }

    #[test]
    fn only_the_configured_scheme_host_and_port_can_navigate() {
        let origin = address("https://silo.example:8090/").unwrap().origin();
        assert!(allows_navigation(
            &origin,
            &Url::parse("https://silo.example:8090/login").unwrap()
        ));
        for raw in [
            "http://silo.example:8090/",
            "https://silo.example/",
            "https://silo.example.other:8090/",
            "tauri://localhost/",
            "blob:https://silo.example:8090/id",
        ] {
            assert!(
                !allows_navigation(&origin, &Url::parse(raw).unwrap()),
                "{raw}"
            );
        }
    }
}
