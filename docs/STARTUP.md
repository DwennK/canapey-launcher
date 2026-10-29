# Startup optimization and measurements

Historical comparison from October 17, 2026, baseline `fc77e57`. That local change did not itself push or publish a release.

## Locally verified result

Two production builds served by the same local HTTP server, tested with system Chrome 155.0.8059.79 on an Apple M4 / 16 GiB Mac. Viewport 1440×900, motion enabled. Twelve navigations per version/scenario, alternating before/after, with a fresh isolated context each time: 48 samples. Chrome and the OS were already running; OS caches were not cleared. No personal profile.

Medians from navigation start:

| Scenario / measurement | Before | After |
| --- | ---: | ---: |
| Empty library: focus plus two frames | 64.9 ms | 66.2 ms |
| Empty library: stable first screen | 665.0 ms | 66.3 ms |
| 24 apps, last selected: focus plus two frames | 62.7 ms | 66.2 ms |
| 24 apps, last selected: card fully in viewport | 1,062.7 ms | 41.2 ms |
| 24 apps, last selected: stable first screen | 1,063.5 ms | 66.4 ms |
| Initial JavaScript requested, uncompressed | 149,663 bytes | 142,776 bytes |
| Initial CSS requested, uncompressed | 32,894 bytes | 28,789 bytes |

The demonstrated improvement is visual stability, from removing the initial fade and animated scrolling to the saved selection. No improvement in time to first frames was demonstrated; differences were only a few milliseconds. Initial JavaScript decreased 4.6%, CSS 12.5%. Deferred modules remain distributed and load when opened.

“Stable” means the selected card is fully visible/focused, its image and expected background/font are loaded, and background/title animations have stopped. This DOM check does not measure the Windows compositor. Raw samples, medians, p95 and asset hashes: [startup-benchmark.json](startup-benchmark.json).

**No cold or warm native Windows startup was measured.** This frontend benchmark excludes the Windows loader, WebView2 and real system calls. It does not support claiming a 66 ms Windows startup.

## Changes

- Lazy-load on-screen keyboard, controller diagnostics and Xbox help/test. Keyboard still takes focus when mounted.
- Load selected-card artwork immediately with priority; defer others.
- Position the initial selection without animated scrolling and show initial title/background without a fade. Later background/view transitions remain enabled.
- Read initial audio after the first two-frame signal.
- Create tray/menu on the main thread after that signal. A three-second watchdog also creates them if the signal never arrives, without duplication. Normal startup does not wait three seconds.
- Keep missing-artwork checks before bootstrap to preserve configuration recovery; measure their cost.

## Automatic native measurements

Normal launches write these to existing logs without manual activation. Open **Settings → Help and updates → Diagnostics → Open logs**. No network reporting is added.

| Field | Meaning |
| --- | --- |
| `startup_begin` | Version, OS, architecture, debug/release profile, PID. `setup_enter_ms`: Rust runtime entry to Tauri setup start. |
| `startup_config_ms` | Data-directory creation, configuration read/recovery and autostart check. |
| `startup_artwork_check_ms` | Artwork checks, with saved app count. |
| `startup_display_ms` | Display selection and window-mode application. |
| `startup_setup_ms` | Tauri setup duration. `startup_setup_complete_ms`: cumulative time from Rust runtime entry. |
| `frontend_loaded_ms` | Native cumulative time when display is requested after config, subscriptions and frontend focus. |
| `startup_interactive_ms` | Cumulative time at the frontend signal after display and two `requestAnimationFrame` callbacks. Does not guarantee complete artwork loading or physical-controller readiness. |
| `startup_frontend_timings` | JSON marks `entry`, `mounted`, `bootstrapStart/End`, `subscribeStart/End`, `focused`, `painted`, in ms from WebView navigation origin. Unreached steps are `null`. |
| `startup_deferred_tray_ms` | Tray/menu creation duration outside the normal path to the initial frame signal. |
| `startup_show_watchdog_ms` | Present only when the fallback shows the window after three seconds without a readiness signal. |

Frontend marks are also available through `performance.getEntriesByType('mark')`, prefixed `canapey:`. `entry` follows import evaluation; `mounted` follows Vue mounting. Subtract Start/End boundaries for IPC durations. Rust/frontend clocks have different origins and must not be subtracted from each other. Nested phase durations do not sum to the total.

Logs identify the build profile but do not infer cold versus warm starts. Returning from an app retains `return_window_request_ms` and `return_interactive_ms`.

## Validation and reproduction

- Isolated startup changes from `fc77e57`: `npm run check`, matching versions, production build, 46 JS/TS and 18 Rust tests passed. After integrating parallel commit `ed355d2`, 21 Rust tests and Windows Clippy passed. Frontend assets matched the measured builds.
- Rustfmt and macOS `cargo check --locked` passed.
- Windows cross-check with `cargo xwin clippy --manifest-path src-tauri/Cargo.toml --locked --target x86_64-pc-windows-msvc --all-targets -- -D warnings` and Homebrew LLVM passed, without Windows execution.
- Production Playwright `qa-sofa-tools.js` / `qa-audio.js`, desktop/mobile, checked keyboard, fields, controller test and audio fixtures without JS errors. Checked `frontend_painted` before `audio_state`, metric contents, absence of three secondary startup modules and on-demand Xbox loading. Inspected captures/Home in the in-app browser.
- Handshake tests require showing the window before requesting frames, avoiding hidden-WebView suspension; final signal waits for two callbacks, and browser mode makes no native calls.

To reproduce, build baseline/candidate in separate directories, serve their outputs at `http://127.0.0.1:4174/` and `http://127.0.0.1:4175/`, and run `scripts/benchmark-startup.js` using `playwright-cli run-code` with isolated system Chrome and `.playwright/cli.config.json`. It returns samples/statistics without launching or changing a Windows app.
