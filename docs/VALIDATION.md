# Validation record

This document preserves the initial local delivery evidence from **October 16, 2026**, before publication. Per-commit/tag Windows results are in [GitHub Actions](https://github.com/DwennK/canapey-launcher/actions); public installers are in [Releases](https://github.com/DwennK/canapey-launcher/releases). Compilation and automated tests do not replace the physical test matrix below.

## October 17 addendum — experimental update channel

- Signing was provisioned in GitHub Actions: private key/password in secrets, public key in a variable. The pair was verified by signing a control file and checking Ed25519 plus the signed comment; temporary private copies were deleted.
- `npm run check`: build, 37 JS tests (20 updater-related) and 13 Rust tests passed. Coverage: channel selection, absent/invalid keys, promotion after publication, asset integrity, network errors and channel downgrade prevention.
- Actionlint passed; Rustfmt and macOS `cargo check --locked` with generated release configuration passed.
- No release was published by that local change; its first public manifest was to follow the first signed prerelease. Subsequent releases are listed above. End-to-end Windows installation/update remains unverified.
- Initial October 16 results below do not validate the new channel.

## October 17 addendum — app maximization

- Build, 46 JS and 21 Rust tests passed. New cases: late child-window appearance, waiting for a resizable window, one automatic request per window, replacement windows, excluding shared/closing sessions.
- Rustfmt and `git diff --check` passed.
- Windows all-target cargo-xwin Clippy with `-D warnings` and Homebrew LLVM passed. Maximization/resume/close-control/dialog-exclusion native tests compiled but did not execute on the Mac.
- Remaining Windows checks: launch Spotify closed/already open; resume normal/minimized/maximized windows; verify close controls and return after exit; open dialogs; manually resize and wait to rule out repeated maximization. Shared browser windows must remain unchanged.
- No web UI changed; browser screenshots cannot validate this native behavior. That change had no interactive Windows test, push or publication at the time of its local record.

## Initial validation environment and results

macOS ARM64, Node 26, Rust 1.94.1; existing cargo-xwin and NSIS 3.13, Homebrew LLVM 23. Build PATH changes were command-local. Browser checks used installed **Google Chrome**, isolated contexts and no personal profile or Playwright Chromium download.

| Check | Result |
| --- | --- |
| `npm run build` | TypeScript/Vue/Vite passed |
| `npm test` | 9 navigation, selection, incomplete-grid, resize, import-identity and version tests passed |
| `cargo test --no-default-features` | 12 config, validation, deduplication, repetition, hysteresis, hold and process-tracking tests passed |
| macOS `cargo check` | Full Tauri runtime compiled, Windows platform disabled |
| Windows all-target cargo-xwin Clippy, `-D warnings` | Windows code/tests compiled without warnings |
| `tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc --bundles nsis` | Windows x64 binary and unsigned NSIS installer produced |
| Playwright 1440×900 / 390×844 | UI flows passed without JS errors or external requests |
| Visual inspection | Home, grid, desktop/mobile Settings; Home also inspected in-app |
| `npm audit` | No reported vulnerabilities at that delivery |

**Cross-compilation is not Windows execution.** At the initial local delivery, no remote repository had been supplied and GitHub CI had not run. Later CI/publication does not retroactively turn those checks into physical tests. No native performance result is claimed.

UI coverage: horizontal movement/card visibility/rapid backgrounds; carousel/grid/Back and selection; deliberate Netflix/YouTube/Spotify/Internet **web shortcut** imports with targets, themes, persistence and Spotify deduplication; renaming/reordering/save/reload; cancelled/confirmed removal; native-launch-unavailable messages; controls/update-unconfigured state; **cancelled** shutdown; invalid-preview-config recovery; no external hosts; no mobile horizontal overflow.

The offline-resource test blocked every host except local Vite. It establishes self-contained UI resources, not complete offline installed-app behavior.

## Replay UI checks

Start `npm run dev`, then use the installed Playwright skill:

```sh
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 ~/.codex/skills/playwright/scripts/playwright_cli.sh -s=canapey open http://127.0.0.1:1420 --browser chrome --config .playwright/cli.config.json
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 ~/.codex/skills/playwright/scripts/playwright_cli.sh -s=canapey run-code "$(cat scripts/qa-ui.js)"
```

The configuration sets 1440×900 before loading. The script only resets the test browser's `canapey-ui-preview-v1` key, creates its fixtures and removes them afterward. It neither launches/closes Windows apps nor performs power actions. Captures go into Git-ignored `output/playwright/`.

## Remaining Windows 11 x64 physical test matrix

| Flow | Procedure and expected result | Status |
| --- | --- | --- |
| Install / first launch | Per-user install, no white flash, Home without scanning; record OS/architecture | Pending |
| Conventional executable | Import test app, launch, Start+Back, resume, normal close; automatic return and selection | Pending |
| Bootstrapper / child | Initial PID exits; child window remains tracked without early return | Pending |
| Already-open app | Resume exact existing instance; graceful close only, no forced destruction of pre-existing process | Pending |
| Unresponsive app | Disposable test app: WM_CLOSE, five-second wait, explicit force-close confirmation; verify PID/creation time | Pending |
| Shared browser | Existing tabs plus web shortcut; limited tracking, no closing/killing unrelated tabs | Pending |
| Store / Steam | Import detected identity, activation/window/return; document untrackable indirect launchers | Pending |
| Xbox / PlayStation | USB/Bluetooth where available; D-pad, stick, deadzone, A/Cross, B/Circle, Start, regular holds without duplicates/bursts | Pending |
| Reconnection / sleep | Replug and wake; recognition, no stuck keys, release required afterward | Pending |
| Other foreground app | Controller directions must not navigate hidden Canapey; configured Home shortcut recalls it | Pending |
| Focus denied | Exclusive game/elevated app: taskbar fallback/message, no claim to bypass Windows | Pending |
| TV unavailable | Saved TV disconnected at startup/during use; primary-display fallback and reconnection | Pending |
| DPI / resolution | 1080p/4K, 100/150/200% DPI, 80–140% scale, preserved grid/carousel selection | Pending |
| Windows login | Autostart on/off across logins, one instance | Pending |
| Desktop / reopen | Desktop visible; tray/second launch recalls Canapey | Pending |
| Missing/invalid config | Back up disposable data, remove/invalidate config; defaults/backup used, original preserved | Logic tested; integration pending |
| Icons/artwork | `.lnk` with spaces/arguments, Store apps, card/background picker, restart/local storage | Pending |
| Discovery blocked | AppLocker/PowerShell block/timeout; concise error, usable Home, manual `.exe` import | Pending |
| Offline | Installed app/WebView2, disconnect Internet before launch; UI/local apps work | Pending |
| Shutdown/restart/sleep | Cancel each first; then confirm on an empty test PC and verify resume | Pending |
| Update unavailable | Offline/broken endpoint; no blocking and useful manual error | UI tested; native network pending |
| Signed update | Two signed versions, promoted channel, signature/notes/install/data preservation; reject invalid signature | Keys configured; Windows flow pending |

## Native performance protocol

Startup phases are logged automatically since October 17; see [STARTUP.md](STARTUP.md). Windows values remain unmeasured; Chrome benchmarks are not substitutes.

- `frontend_loaded_ms`: Vue/config loading before display request.
- `startup_interactive_ms`: Rust entry to signal after display and two frames. Show the launcher **before** requesting frames to avoid hidden-WebView suspension.
- `return_window_request_ms`: foreground request, not proof of paint.
- `return_interactive_ms`: return to frontend signal after two frames.

Use Release, identical apps/artwork/display and no devtools. Record CPU, RAM, SSD, Windows, resolution/DPI and WebView2. Measure **five first launches after PC reboot** (cold), **ten launches after fully quitting Canapey** (warm), and **ten returns from another app**. Recalling an existing instance is not a warm start. Keep raw values, median and p95; use external process-creation-to-interaction timing to include the Windows loader.

| Target-PC metric | Value |
| --- | --- |
| Cold | Not measured |
| Warm | Not measured |
| Return | Not measured |

Target: **under one second** to interactive Home on a recent SSD-equipped PC. No result is extrapolated from Vite, Mac Chrome or build duration; no full Windows boot time is claimed.

## Historical local deliverables

- `release/Canapey-Launcher-0.1.0-windows-x64-setup.exe`: initial installer, 5,654,170 bytes.
- `release/SHA256SUMS.txt`: hash checked after copying.
- `docs/build-validation.json`: results and source/installer hashes.
- At that initial stage, no Git repository pre-existed and no commit/push/publication had occurred. This is a historical record, not the current repository status.

## Detailed controls validation

October 16 covered 76 desktop/mobile panel states, all active controls reachable by arrows. Repeated with keyboard and controller IPC fixtures; no physical Windows/controller execution is represented as passed. Details: [CONTROLES.md](CONTROLES.md); structured results: [controls-validation.json](controls-validation.json).

## On-screen keyboard/controller test — October 17, 2026

- Historical AZERTY keyboard: controller-event entry, all keys/actions, accents, uppercase, symbols, deletion, selection replacement, confirmation/cancellation, saved search/rename, focus restoration and physical typing. The current English UI uses QWERTY.
- Controller view: buttons/axes/triggers/filtered direction, Xbox/PlayStation labels, reconnect, suspended navigation during capture, exit and saved deadzone.
- Isolated system Chrome 1440×900/390×844 without JS errors. `scripts/qa-sofa-tools.js` uses IPC fixtures and does not prove physical readings or actual held B / Circle on Windows.
- Isolated-change validation passed build, 44 JS/13 Rust tests, Rustfmt and Windows Clippy without warnings.
- Remaining hardware: Xbox/PlayStation USB/Bluetooth, resting/extreme sticks, driver-dependent trigger values, held B / Circle exit, focus loss, reconnect, no stray navigation after testing, Steam Input interaction.

Replay `scripts/qa-sofa-tools.js` with `playwright-cli run-code` in a dedicated system Chrome session against Vite.
