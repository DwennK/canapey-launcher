# iPhone / Apple TV Remote

Status as of **October 19, 2026**: experimental Rust port for v0.5.0, disabled by default and Windows-only. Automated pyatv interoperability passed; **discovery and operation with a real iPhone on Windows remain unverified**. See [v0.5.0](https://github.com/DwennK/canapey-launcher/releases/tag/v0.5.0) for distributed assets and delivery results.

## Usage

Open **Settings → Controls → iPhone**, enable the service, then choose **Pair an iPhone**. Open Apple TV Remote in iPhone Control Center, select the PC and enter Canapey's displayed PIN. Both devices must share a private local network. No Python, helper program or additional iOS software is distributed. Canapey must remain open.

The initial name is `Canapey — <COMPUTERNAME>`. **Name and network** changes it and selects a network adapter; Automatic chooses an available private IPv4 interface. Adapter identity survives DHCP changes.

| Input | Canapey foreground | Other application |
| --- | --- | --- |
| Swipe | One directional step | Corresponding arrow |
| Center tap | Confirm; hold for card options | Enter |
| Back | Navigate back | Escape |
| TV | Home | Return to Canapey Home |
| Play/pause | Windows media command | Same |
| Volume | Windows volume | Same |

**My iPhone cannot find Canapey** explains Private profiles, VPNs, guest networks and private firewall permissions: TCP on the displayed port and mDNS UDP 5353. It does not inspect actual firewall rules or automatically add exceptions.

## Provenance and tracking

| Source | Latest reviewed reference | Ported / used reference |
| --- | --- | --- |
| [windows-apple-remote](https://github.com/aryakvn/windows-apple-remote) | [`c8a494dcb656c79248fd24d60a814b35aa051e54`](https://github.com/aryakvn/windows-apple-remote/tree/c8a494dcb656c79248fd24d60a814b35aa051e54), release 0.2.0; HEAD rechecked October 30, 2026 | Companion subset of this commit, adapted to Rust for v0.5.0; not a complete port |
| [pyatv](https://github.com/postlund/pyatv) | [`b277a4c8222ecdcbaab8a24e3e713ca44765adb4`](https://github.com/postlund/pyatv/tree/b277a4c8222ecdcbaab8a24e3e713ca44765adb4), HEAD rechecked October 30, 2026; compared with `v0.18.0` for Companion, HAP/SRP, OPACK and ChaCha20 | Interoperability oracle `pyatv==0.18.0`; adapted cryptographic/serialization conventions |
| [Companion documentation](https://pyatv.dev/documentation/protocols/#companion-link) | Read October 19, 2026 | Protocol description, not an Apple compatibility guarantee |

Full MIT licenses and copyrights are retained in [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md), also bundled as an application resource. The reference Python code is not shipped.

### Mapping and adaptations

| Python reference | Rust code | Decisions |
| --- | --- | --- |
| `server.py`: Companion advertisement/connection | `apple_remote/server.rs`, `session.rs` | Tokio, mDNS bound to the selected address, connection shutdown and explicit limits |
| `server_auth.py`, pyatv HAP/SRP helpers | `apple_remote/auth.rs` | SRP-3072/SHA-512, HKDF, Ed25519, X25519, ChaCha20-Poly1305; independent random Canapey keys |
| pyatv `opack.py` and TLV8 | `apple_remote/codec.rs` | Typed OPACK references; empty strings/blobs excluded from reference table; bounded sizes/depth |
| pyatv `chacha20.py` | `apple_remote/auth.rs::Cipher` | 12-byte stream nonce with little-endian counter in the first eight bytes; authenticated header |
| Apple TV information, sessions and gestures in `server.py` | `apple_remote/session.rs` | `_systemInfo`, `_sessionStart`, `TVRCSessionStart`, `_interest`, `_hidC`, `_hidT`, `_touchStart`; compatibility metadata retained |
| Python key/media injection | `apple_remote_desktop.rs`, `platform/windows.rs` | Existing actions, `iphone` origin, targeted Windows recipient, TV returns to Canapey |
| Original persistence/settings | `apple_remote/mod.rs`, `apple_remote_desktop/windows.rs` | User DPAPI identity, explicit pairing, revocation and Tauri configuration |

Companion/HAP SRP proofs differ from the `srp` library's default `process_reply`. That library handles exponentiation; M1/M2 follow conventions verified against srptools/pyatv: 384-byte padding for `u`, salt **including leading zeroes**, and minimal integers where expected. `fixtures/srp-leading-zero.json` contains test values only.

Ported: empty-string OPACK reference fix, expected session-opening responses/information, touchpad support and release-only HID messages. Adapted: one-cell swipe navigation and TV returning to Canapey. Deliberately excluded: mouse mode, TV mouse toggle, Siri, AirPlay, playback metadata and PC wake. Inherited Siri metadata supports discovery compatibility without implementing voice.

### Monitoring and release review

The implementation chat's recorded Codex monitor runs **Mondays at 09:00 Europe/Zurich**, ID `veille-t-l-commande-iphone-canapey`. It watches relevant windows-apple-remote commits/releases/issues and pyatv Companion changes, reporting applicable improvements, regressions, security fixes or blockers with links/impact. It does not modify or automatically port code.

`AGENTS.md` also requires review before every release. Add a dated row with references, changes, decision, rationale and tests. **Reviewed** means evaluated; **integrated** requires an actual tested port. Never advance integrated references simply because upstream released something new. The pyatv reference above does not imply every later change was reviewed.

| Release review | Reviewed references | Decision and validation |
| --- | --- | --- |
| October 19, 2026, v0.5.0 | windows-apple-remote `c8a494d`; pyatv `b277a4c8222ecdcbaab8a24e3e713ca44765adb4` versus `v0.18.0` | windows-apple-remote HEAD unchanged, no open issues at review time; no Companion/OPACK/HAP-SRP/ChaCha20/TLV8 changes in pyatv comparison. No additional fix to port; integrated references unchanged. pyatv oracle and release checks rerun. |
| October 29, 2026, v0.6.0 | windows-apple-remote `c8a494dcb656c79248fd24d60a814b35aa051e54`, latest `v0.2.0`; pyatv `b277a4c8222ecdcbaab8a24e3e713ca44765adb4` | Both HEADs unchanged since October 19; no open windows-apple-remote issues. pyatv comparison with `v0.18.0` changes only `CHANGES.md` and `pyatv/const.py`, no Companion/crypto files. No new fixes accepted/rejected; actually ported references unchanged. Local Rust tests and CI Companion oracle required for this release. |
| October 30, 2026, v0.7.0 | windows-apple-remote `c8a494dcb656c79248fd24d60a814b35aa051e54`; pyatv `b277a4c8222ecdcbaab8a24e3e713ca44765adb4` | Both HEADs unchanged; no open windows-apple-remote issues. Comparing pyatv with v0.18.0 still changes only CHANGES.md and pyatv/const.py. No new Companion fix to accept or reject; integrated revisions unchanged. Windows tests and the CI Companion oracle are release gates. |

## Architecture and protection limits

- `apple_remote` is independent of Tauri and testable with `--no-default-features`. The desktop layer owns Windows integration, settings and routing.
- Networking starts after `frontend_painted`. Disabled mode neither enumerates interfaces nor opens sockets. Identity loads on first activation. No helpers/Python processes.
- Pairing opens explicitly for 120 seconds with a random four-digit PIN and at most five attempt starts per opening. Cancellation, expiry, network change and success close access; a new code invalidates old negotiations. Commands require cryptographic verification.
- Identity and at most eight devices live in `apple-remote/identity.dpapi` under Tauri data, separate from settings JSON. User-bound DPAPI encryption, synchronized temporary write and atomic replacement. Corruption reports an error without silently replacing identity.
- Revocation persists before authorization is removed. A signal interrupts affected sessions; queued actions are reauthorized when processed. Disconnect cancels active confirmation and releases external keys to their original recipient even after focus changes.
- External navigation uses targeted window messages rather than `SendInput`, avoiding Flirc global shortcuts. Press/release transitions are preserved without extra automatic repeats.
- Four simultaneous connections; 30-second negotiation; 600-second idle limit; five-second fragment-read/write limits; 256 frames/second/connection; 64 KiB frames; OPACK depth 24, 4,096 nodes, 256 KiB decoded-content budget. Native queue holds 64 actions and cancels presses on saturation.
- Listens on one IPv4 address classified **Private** by Windows, excluding Public and Domain networks. Rechecks every three seconds, so profile changes have a detection delay. Address changes trigger supervised restart. No public port is automatically opened. Private-only firewall rules complement this selection during the delay.
- PINs/keys are not logged. The temporary PIN reaches the frontend for display. The development loopback probe prints its own ephemeral test PIN for the Python oracle and is not shipped.

Functional limits: IPv4 only; no complete automatic firewall diagnostic; iPhone entries use identifiers because no friendly name is supplied; relative volume uses an approximate protocol value without actual volume feedback. Elevated windows and apps ignoring key messages may reject navigation. iOS metadata compatibility and sleep/resume need physical testing.

## Reproducible validation

```sh
npm run check
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo build --manifest-path src-tauri/Cargo.toml --locked --no-default-features --example companion_probe
python3 -m venv /tmp/canapey-companion-tests
/tmp/canapey-companion-tests/bin/pip install -r scripts/apple-remote-test-requirements.txt
/tmp/canapey-companion-tests/bin/python scripts/test-apple-remote.py
```

Python is an isolated development tool only. The test uses `127.0.0.1` without mDNS advertisement or persisted user identity. It covers wrong PIN, correct pairing, encrypted verification/commands, reconnection, active-session revocation, post-revocation rejection, unauthenticated commands and oversized frames. A pyatv warning about the old HID volume API is expected; absolute audio feedback is unsupported.

The Linux `companion-interop` CI job runs the same oracle. Windows CI runs native tests including DPAPI and targeted key messages. See [GitHub Actions](https://github.com/DwennK/canapey-launcher/actions) for delivery results. Historical local checks below preceded delivery.

Local checks on October 19, 2026:

- `npm run check`: frontend build, matching versions, **70 JS and 47 Rust tests passed**.
- Rustfmt and all-target Windows x64 cargo-xwin Clippy with `-D warnings`; compilation/static analysis, not Windows execution.
- pyatv 0.18.0 oracle passed the scenarios above.
- Isolated system Chrome, `scripts/qa-apple-remote.js`, 1440×900 and 390×844: enable/save/failure, leading-zero PIN, cancel, simulated expiry, revoke, network errors and release/duplicate/distinct-connection handling. No JavaScript errors; mocked Tauri IPC.
- `scripts/qa-remote.js` regression passed with eleven Flirc bindings and existing screens/interactions. Additional in-app browser inspection correctly showed Windows availability.
- `scripts/benchmark-apple-remote.js`, production Vite on port 4178: eight alternating loads per state, fresh Chrome contexts. Median first-display signal **54.85 ms disabled / 56.25 ms enabled**. iPhone settings are lazy-loaded. Mocked-renderer measurement does not establish Windows Tauri/network/DPAPI cost.

QA scripts run through `playwright-cli run-code` against Vite in a dedicated Chrome session; no personal profile is needed.

## Remaining hardware validation

Do not claim hardware compatibility before filling this table.

| Windows + iPhone check | Result / versions |
| --- | --- |
| Windows version, iPhone model/iOS version, adapter | Not tested |
| mDNS discovery, custom name, wrong then correct PIN | Not tested |
| Every gesture/button, long press, no duplicate confirmation | Not tested |
| Arrows/Enter/Escape in browser, player and game, with Flirc active | Not tested |
| TV returns to Canapey; ordinary swipes do not | Not tested |
| Windows playback and volume | Not tested |
| App/PC restart preserves identity/pairings | Not tested |
| Revoke during hold, disconnect, enable/disable | Not tested |
| Private → Public, Wi-Fi/DHCP change, sleep/resume | Not tested |
| Private firewall allowed/blocked, VPN, guest network | Not tested |
| Installed startup enabled/disabled under equal conditions, repeated measurements | Not tested |

For the last check, compare existing startup metrics and `apple_remote_bind_ms`, which measures bind/advertisement after first display, not total startup. Never attach PINs, keys or identity files to reports.
