# TV power

Controls → TV connects one compatible TV to the current Windows account. Version **0.8.0** includes Philips jointSPACE v6 and the additional experimental TV families below. Physical Windows lifecycle validation is still required.

## Compatibility in v0.8.0

| Family / brands | Connection | Power and setup |
| --- | --- | --- |
| Philips jointSPACE v6 | Four-digit TV PIN; HTTPS + Digest | WoL followed by absolute On; reads both power and screen state. Enable WoWLAN / Wake on LAN. |
| LG webOS | Accept the on-screen permission prompt; saved SSAP client key | WoL, explicit screen-on and standby. Requires a webOS SSAP socket (3001 TLS, or 3000 on older models) and readable power state. Enable TV On With Mobile / LG Connect Apps. |
| Samsung Tizen | Accept the on-screen permission prompt; saved token | WoL plus absolute PowerOn/PowerOff remote keys. Requires the token-based TLS remote socket on 8002; legacy pre-Tizen protocols are excluded. Enable Power On with Mobile and permit Canapey. |
| Sony BRAVIA with IP control | Enter the pre-shared key configured on the TV | WoL + REST setPowerStatus. Enable IP control, PSK authentication and Remote start. Pairing verifies the key with an absolute On command while the TV is on. |
| TCL, Hisense and Roku-branded **Roku TVs** | Local network access; no PIN | WoL + ECP PowerOn/PowerOff. Enable Control by mobile apps and Fast TV Start. A streaming stick/box is never treated as a TV. |

Brand alone is insufficient. TCL/Hisense Google TV, Android TV and VIDAA models are not supported by the Roku adapter. Sony Google TV models only qualify if they expose the BRAVIA REST API. Panasonic and other proprietary systems are not included. No ADB, developer-mode changes, cloud accounts or HDMI-CEC assumptions are used. New adapters have protocol/transport tests and simulated UI coverage; they have **not** been tested on physical LG, Samsung, Sony or Roku TVs. A majority-of-models compatibility claim would be unsupported.

Network standby and firmware behavior vary by model. Samsung and Sony report power state, not independent physical screen state; success explicitly asks the user to check the picture. LG/Philips/Roku also require an explicit screen-on state. Unknown power state never counts as success. A sent standby request is not physical screen confirmation.

## Setup

1. Turn on the TV and connect it and the PC to the same local IPv4 network. Avoid guest Wi-Fi or client isolation.
2. Open **Settings → Controls → TV → Find my TV**. Select the TV by its name; its IP address helps distinguish similar names.
3. For Philips, choose **Show code on TV**, then enter the four-digit PIN. Other adapters guide you through on-screen approval, a Sony pre-shared key, or Roku network permissions. The countdown reflects the connection request lifetime. An expired request can be started again. Cancelling a replacement keeps the previously paired TV.
4. **Turn on the TV automatically** is enabled after pairing. It covers Canapey launch and PC resume. Enable Canapey's Windows startup preference separately if it should open at login.
5. **Turn off the TV automatically** is disabled by default. Enabling it sends an absolute Standby command before PC sleep or shutdown, including restart. Canapey must remain running.
6. Test **Turn off TV now**, then **Test TV wake**. Wake may take up to 70 seconds. A reachable network or a successful ping alone does not prove that the screen is on.

If discovery finds nothing, **My TV is not listed** accepts the TV's private IPv4 address. The app checks protocol compatibility before authorizing the connection. Normally Windows resolves the active interface's MAC automatically. If it cannot, setup asks for the Wi-Fi or Ethernet MAC shown in the TV's network settings. Network wake must be enabled on the TV; Philips may call this **Switch on with Wi-Fi (WoWLAN)** or **Wake on LAN**. This does not use HDMI-CEC and does not require a CEC-capable PC.

Browser and non-Windows previews disable network pairing. Only detected, recognized API families appear in the results. Unsupported brands or protocol versions are not advertised as compatible. User-defined TV names are displayed unchanged.

## PC HDMI input (v0.9.0)

With the paired TV on, open **Settings → Controls → TV → Find HDMI inputs**, then choose the port connected to the PC. **Keep current input** is the default for new and existing pairings. The saved preference applies to the manual wake button and to automatic wake when enabled. The source command follows confirmation of the TV power state. Check the picture on the TV to confirm the switch.

LG webOS lists SSAP external inputs, Sony BRAVIA lists HDMI URIs from its AV Content API, and Roku TVs list configured HDMI tiles. Philips jointSPACE v6 models advertising activity intents offer four candidate MediaTek passthrough ports. Philips firmware and physical port counts vary. Samsung Tizen currently supports power only. On LG, the TV may require renewed permission for input control.

On the development branch, **Last wake attempt** shows whether a wake packet was sent, the paired TV answered a status request, its power state was confirmed, and the configured HDMI input command was accepted. If only switching the input fails, **Retry HDMI input** checks the TV’s network identity again and sends only the saved input command. Check the picture on the TV to confirm the source.

## Behavior and storage

- Discovery uses bounded SSDP and Chromecast mDNS queries on local IPv4 interfaces, followed by fixed Philips, Samsung, Sony and Roku API probes. LG uses an unauthenticated SSDP XML description restricted to the packet source’s literal IP, then verifies its SSAP socket. Manual LG IP lookup can also identify an unauthenticated SSAP system-info response without opening a pairing prompt. Cross-host URLs, embedded credentials and redirects are rejected; responses are capped at 64 KiB. Manual input accepts only literal private/link-local IPv4 addresses.
- Philips pairing uses HTTPS on port 1926, PIN/HMAC-SHA1 and HTTP Digest authentication. Other protocols use their local authentication scheme from the table above. Older LG webOS and HTTP-only Sony APIs carry their keys over the local network without TLS; keep them on a trusted LAN. The TV's self-signed TLS certificate is accepted by this dedicated client; redirects and proxies are disabled. Pairing credentials are kept in native code and never returned to the webview, written to logs, or stored in the main configuration JSON.
- Windows DPAPI protects `tv.dpapi` in Canapey's application-data directory for the current Windows account. Atomic replacement preserves the previous pairing on a failed save. Corrupt storage is reported without silently discarding it. **Forget this TV** removes the local pairing and both automatic actions; revocation on the TV depends on its platform: remove Canapey from permitted apps or change the Sony PSK. Roku uses network permissions, not a per-app pairing secret.
- Wake broadcasts a magic packet on each local IPv4 interface, waits for the network, and sends the platform’s absolute On command. Philips success requires both `powerstate: On` and `screenstate: On`; other adapters use the states described above. The saved MAC must match before authenticated control is sent. Discovery can recover an IP change by matching both that MAC and the saved protocol family. Routed networks without direct ARP visibility are unsupported.
- Standby uses each adapter’s explicit off command, never a generic power-toggle key or a Wake on LAN packet. LG checks that the TV is on before issuing turnOff, since some firmware behaves unexpectedly if it is already in standby. The manual success message records a standby request (or an already-standby LG TV); a TV that immediately disconnects cannot confirm its screen state over the network.
- Windows resume uses `PBT_APMRESUMEAUTOMATIC`, including unattended Windows wakes. Suspension cancels any wake in progress. Duplicate resume events are debounced.
- Canapey's power menu gives TV standby up to four seconds before invoking Windows power. Native suspend and confirmed end-session notifications allow a much shorter best-effort request (1.4 seconds, callback bounded at 1.6 seconds). Network loss or force shutdown can prevent delivery; TV failure never prevents PC sleep/shutdown. Ordinary app exit, logoff, cancelled shutdown and app replacement notifications do not trigger automatic standby. Windows end-session notifications cannot distinguish shutdown from restart.

## Validation

Automated checks cover bounded HTTP responses and refusal of redirects, local WebSocket registration/denial, protocol-specific state interpretation, saved-Philips migration, SSDP source restrictions, Roku TV/player distinction, input validation, leading-zero PINs, PIN expiry, protocol signing, magic packets, configuration persistence and conservative standby defaults. Windows-only tests exercise DPAPI round trips/corruption and end-session filtering. Cross-compiling these tests is not the same as running them on Windows.

`scripts/qa-tv.js` runs with the existing Playwright CLI session against Vite using simulated native IPC. It covers empty/multiple discovery results, manual IP and MAC fallback, unsupported devices, expired/invalid PINs, both preference defaults and persistence, failed-save rollback, wake failure/success, manual standby, replacement cancellation, forgetting, and the unsupported browser state. It uses isolated system Chrome at 1440×900 and 390×844; no real TV or PC power actions occur in that script.

`scripts/qa-tv-multibrand.js` also covers the four new connection families, cancellation while waiting for on-screen approval, a masked Sony PSK field, and the unchanged automatic-power defaults on desktop/mobile. These are simulated IPC flows, not hardware tests.

Real Philips testing before integration established that Wake on LAN alone restored network reachability while leaving the screen off; an authenticated `powerstate: On` command then lit the screen, confirmed by the user. The Rust diagnostic also discovers that TV and successfully reads power/screen state and sends an authenticated On command while it is already on. This does **not** prove a complete Rust cold-wake cycle, Rust PIN pairing, native Windows ARP resolution, or Windows lifecycle callbacks on the GMKtec. The macOS diagnostic did not resolve the real TV's MAC automatically in this environment.

Before relying on this feature, validate on the target Windows PC: PIN pairing, restart persistence, manual standby/wake, startup with a sleeping TV, sleep/resume with both switches enabled/disabled, shutdown/restart, Wi-Fi reconnect delay, unavailable TV, expired/revoked pairing, and DHCP address changes. Confirm the physical screen, not only network/API availability. Do not trigger PC power actions in automated UI tests.

## Opt-in native diagnostic

`cargo run --manifest-path src-tauri/Cargo.toml --no-default-features --example tv_probe -- discover` finds compatible TVs. `inspect <private-IP>` reads compatibility without pairing. `on <private-JSON>` sends an absolute On command and `wake <private-JSON>` runs the bounded wake sequence; both change the real TV's state. The private JSON contains `ip`, `mac`, `username` and `password`; keep it outside the repository with restrictive permissions and never paste it into logs or issues. Credentials are not imported automatically into Canapey.

Protocol reference: [ha-philipsjs](https://github.com/danielperna84/ha-philipsjs), with attribution in [third-party notices](../THIRD_PARTY_NOTICES.md). Windows lifecycle references: [suspend timing](https://learn.microsoft.com/en-us/windows/win32/power/pbt-apmsuspend), [confirmed end-session behavior](https://learn.microsoft.com/en-us/windows/win32/shutdown/wm-endsession), and [resume notifications](https://learn.microsoft.com/en-us/windows/win32/power/pbt-apmresumeautomatic).


Additional protocol references (independent Rust adapters; no Python library is bundled):

- [LG SSAP endpoints and registration](https://github.com/home-assistant-libs/aiowebostv), including power/screen distinction and immediate disconnect on standby.
- [Samsung remote protocol](https://github.com/xchwarze/samsung-tv-ws-api) and [Samsung integration setup](https://www.home-assistant.io/integrations/samsungtv/).
- [Sony IP-control manual](https://pro.sony/support/res/manuals/5027/d1fbdac03566828ed7d628def033e3de/50270921M.pdf) and [BRAVIA REST client](https://github.com/mjaksn/bravia-http-remote).
- [Roku ECP](https://developer.roku.com/dev/docs/external-control-api) and [Roku key mapping, including PowerOn](https://github.com/ctalkington/python-rokuecp/blob/main/src/rokuecp/const.py).
