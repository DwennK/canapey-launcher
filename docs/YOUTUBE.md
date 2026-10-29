# YouTube in Canapey

## Flow

The **YouTube** card appears on Home and in the library even before installation. It respects search and the Video filter. Its labels are **YouTube**, **Install YouTube** and **Open YouTube**.

Opening the card checks existing installations. A detected installation is saved and opened fullscreen. Otherwise, the panel shows the latest stable version and download size. Install downloads the installer and opens the standard Windows wizard; when it exits, Canapey checks again and saves the card. Open becomes available only after successful detection.

Existing entries keep their ID, favorites, category and custom artwork. Detecting a moved executable repairs its path. Existing web shortcuts remain separate with their Web badge. A portable installation in an arbitrary folder must be added manually or have a recognized shortcut.

## Implementation

- Uses [shy1132/VacuumTube](https://github.com/shy1132/VacuumTube).
- Resolves GitHub `releases/latest` at installation time; rejects drafts and prereleases.
- Accepts only `VacuumTube-Setup.exe` from the expected repository and tag. Requires HTTPS, approved GitHub redirects, a maximum of 512 MiB, and the exact size and SHA-256 supplied by GitHub. This does not replace Authenticode verification.
- Streams into a dedicated temporary directory, cleaned after completion, error or normal cancellation. Cancellation also works if the server stops responding. Only one installation runs at a time.
- The wizard is interactive; Canapey neither installs silently nor forces elevation. The panel stays open. Cancelling the wizard creates no card when the executable is absent.
- Detection covers saved paths, LocalAppData/Programs, Program Files, user/machine uninstall registry entries, and Start Menu/Desktop shortcuts. Uses a fixed PowerShell script without command interpolation and a 20-second timeout.
- Saves through the normal configuration flow. After a save failure, Open can retry without downloading again.
- Browser preview displays the panel with installation disabled; installation requires Windows.

## Local validation — October 29, 2026

- Vue/TypeScript build and 86 frontend tests passed, including five catalog/registration tests.
- 51 Rust tests passed, covering metadata, altered/truncated/oversized downloads and cancellation of a stalled request.
- Explicit network test using the actual client returned `v2.0.1`, `238708670` bytes and SHA-256 `25f8f5e631175392e5d721fcedda7c1b49775e59d25453d4e99ab468bfa02875`. This test is ignored by default to keep the suite offline. Run it with `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features vacuumtube::tests::live_latest_stable_release -- --ignored --nocapture`.
- Windows x64 cross-check passed with `cargo xwin clippy --target x86_64-pc-windows-msvc -- -D warnings`; formatting and version consistency passed.
- Isolated system Chrome at 1440×900 and 390×844 covered artwork, search/filters, progress, cancellation, network errors, wizard exit, save failure/retry, existing installations, moved paths and deduplication without JavaScript errors. Windows responses were simulated. Local evidence: `output/playwright/youtube/`.

The real Windows installer, registry/shortcut detection, application launch and TV controls still require interactive testing on a Windows PC. Cross-compilation and browser simulations do not validate these physical interactions. These results describe the implementation validation before its inclusion in v0.6.0.
