# Philips TV power

Controls → TV pairs one compatible Philips jointSPACE v6 TV with the current Windows account. This is development-source functionality; it is not included in the published v0.6.0 installer.

## Setup

1. Turn on the TV and connect it and the PC to the same local IPv4 network. Avoid guest Wi-Fi or client isolation.
2. Open **Settings → Controls → TV → Find my TV**. Select the TV by its name; its IP address helps distinguish similar names.
3. Choose **Show code on TV**, then enter the four-digit PIN. The countdown reflects the TV's pairing timeout. An expired code can be requested again. Cancelling a replacement keeps the previously paired TV.
4. **Turn on the TV automatically** is enabled after pairing. It covers Canapey launch and PC resume. Enable Canapey's Windows startup preference separately if it should open at login.
5. **Turn off the TV automatically** is disabled by default. Enabling it sends an absolute Standby command before PC sleep or shutdown, including restart. Canapey must remain running.
6. Test **Turn off TV now**, then **Test TV wake**. Wake may take up to 70 seconds. A reachable network or a successful ping alone does not prove that the screen is on.

If discovery finds nothing, **My TV is not listed** accepts the TV's private IPv4 address. The app checks protocol compatibility before requesting a PIN. Normally Windows resolves the active interface's MAC automatically. If it cannot, setup asks for the Wi-Fi or Ethernet MAC shown in the TV's network settings. Network wake must be enabled on the TV; Philips may call this **Switch on with Wi-Fi (WoWLAN)** or **Wake on LAN**. This does not use HDMI-CEC and does not require a CEC-capable PC.

Browser and non-Windows previews disable network pairing. Unsupported TV brands or protocol versions are not advertised as compatible. User-defined TV names are displayed unchanged.

## Behavior and storage

- Discovery uses bounded SSDP and Chromecast mDNS queries on local IPv4 interfaces, followed by a fixed Philips `/6/system` probe. SSDP LOCATION URLs are never followed. Manual input accepts only literal private/link-local IPv4 addresses.
- Pairing uses HTTPS on port 1926, Philips PIN/HMAC-SHA1 and HTTP Digest authentication. The TV's self-signed TLS certificate is accepted by this dedicated client; redirects and proxies are disabled. Pairing credentials are kept in native code and never returned to the webview, written to logs, or stored in the main configuration JSON.
- Windows DPAPI protects `tv.dpapi` in Canapey's application-data directory for the current Windows account. Atomic replacement preserves the previous pairing on a failed save. Corrupt storage is reported without silently discarding it. **Forget this TV** removes the local pairing and both automatic actions; revocation on the TV is available in its paired-app settings.
- Wake broadcasts a magic packet on each local IPv4 interface, waits for the network, and sends absolute `powerstate: On` commands. Success requires both `powerstate: On` and `screenstate: On`. The saved MAC must match before authenticated control is sent. Discovery can recover an IP change by matching that MAC. Routed networks without direct ARP visibility are unsupported.
- Standby sends absolute `powerstate: Standby`, never a toggle and never a Wake on LAN packet. The manual success message means the TV accepted the command; a TV that immediately disconnects cannot confirm its screen state over the network.
- Windows resume uses `PBT_APMRESUMEAUTOMATIC`, including unattended Windows wakes. Suspension cancels any wake in progress. Duplicate resume events are debounced.
- Canapey's power menu gives TV standby up to four seconds before invoking Windows power. Native suspend and confirmed end-session notifications allow a much shorter best-effort request (1.4 seconds, callback bounded at 1.6 seconds). Network loss or force shutdown can prevent delivery; TV failure never prevents PC sleep/shutdown. Ordinary app exit, logoff, cancelled shutdown and app replacement notifications do not trigger automatic standby. Windows end-session notifications cannot distinguish shutdown from restart.

## Validation

Automated checks cover input validation, leading-zero PINs, PIN expiry, protocol signing, magic packets, configuration persistence and conservative standby defaults. Windows-only tests exercise DPAPI round trips/corruption and end-session filtering. Cross-compiling these tests is not the same as running them on Windows.

`scripts/qa-tv.js` runs with the existing Playwright CLI session against Vite using simulated native IPC. It covers empty/multiple discovery results, manual IP and MAC fallback, unsupported devices, expired/invalid PINs, both preference defaults and persistence, failed-save rollback, wake failure/success, manual standby, replacement cancellation, forgetting, and the unsupported browser state. It uses isolated system Chrome at 1440×900 and 390×844; no real TV or PC power actions occur in that script.

Real Philips testing before integration established that Wake on LAN alone restored network reachability while leaving the screen off; an authenticated `powerstate: On` command then lit the screen, confirmed by the user. The Rust diagnostic also discovers that TV and successfully reads power/screen state and sends an authenticated On command while it is already on. This does **not** prove a complete Rust cold-wake cycle, Rust PIN pairing, native Windows ARP resolution, or Windows lifecycle callbacks on the GMKtec. The macOS diagnostic did not resolve the real TV's MAC automatically in this environment.

Before relying on this feature, validate on the target Windows PC: PIN pairing, restart persistence, manual standby/wake, startup with a sleeping TV, sleep/resume with both switches enabled/disabled, shutdown/restart, Wi-Fi reconnect delay, unavailable TV, expired/revoked pairing, and DHCP address changes. Confirm the physical screen, not only network/API availability. Do not trigger PC power actions in automated UI tests.

## Opt-in native diagnostic

`cargo run --manifest-path src-tauri/Cargo.toml --no-default-features --example tv_probe -- discover` finds compatible TVs. `inspect <private-IP>` reads compatibility without pairing. `on <private-JSON>` sends an absolute On command and `wake <private-JSON>` runs the bounded wake sequence; both change the real TV's state. The private JSON contains `ip`, `mac`, `username` and `password`; keep it outside the repository with restrictive permissions and never paste it into logs or issues. Credentials are not imported automatically into Canapey.

Protocol reference: [ha-philipsjs](https://github.com/danielperna84/ha-philipsjs), with attribution in [third-party notices](../THIRD_PARTY_NOTICES.md). Windows lifecycle references: [suspend timing](https://learn.microsoft.com/en-us/windows/win32/power/pbt-apmsuspend), [confirmed end-session behavior](https://learn.microsoft.com/en-us/windows/win32/shutdown/wm-endsession), and [resume notifications](https://learn.microsoft.com/en-us/windows/win32/power/pbt-apmresumeautomatic).
