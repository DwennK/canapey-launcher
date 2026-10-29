# Quick controls

The audio button beside the clock opens Windows master volume, mute and connected output selection. The clock is informational. Sleep is now in the Power menu; the October 16 validation below predates that move.

- Up/down navigates controls. Left/right changes selected volume by two points without an extra editing mode.
- A / Cross or Enter activates. B / Circle or Escape closes and restores focus. Power confirmations start on Cancel.
- Volume/outputs refresh every two seconds while visible and foreground, and when opening the panel, reflecting external changes and disconnections.
- Audio writes are serialized and rapid slider changes coalesced. Commands retain their output ID; Windows rejects volume/mute changes if it is no longer the default output.
- Browser preview reports Windows controls as unavailable and does not invent devices.

## Windows integration

Volume/mute use Core Audio (`IMMDeviceEnumerator`, `IAudioEndpointVolume`) without PowerShell or helpers. COM objects are created/released on the same worker thread; strings and PROPVARIANT values are freed.

Output switching uses the **undocumented** `IPolicyConfig::SetDefaultEndpoint`, also used by [EarTrumpet](https://github.com/File-New-Project/EarTrumpet/blob/master/EarTrumpet/Interop/MMDeviceAPI/IPolicyConfig.cs). It changes all three Windows roles (console, multimedia, communications). Partial failure attempts to restore previous roles and reports an error. This internal interface needs compatibility checks after Windows changes. Apps choosing their own device may retain their routing.

Microsoft reference: [Endpoint volume controls](https://learn.microsoft.com/en-us/windows/win32/coreaudio/endpoint-volume-controls).

## Historical local validation — October 16, 2026

- `npm run check`, Rustfmt and macOS `cargo check --locked` passed.
- Windows code/tests were cross-checked with `cargo xwin clippy --target x86_64-pc-windows-msvc --all-targets -- -D warnings` using Homebrew LLVM, without Windows execution.
- `tests/audio.test.ts` covers coalescing, read/write serialization, device identity, errors and recovery.
- `scripts/qa-audio.js` used isolated system Chrome at 1440×900 and 390×844: keyboard/simulated controller navigation, volume, mute, outputs, sleep cancellation/confirmation, disconnects, long names, scrolling and focus restoration.
- 17 TypeScript and 13 Rust tests passed, as did frontend/macOS compilation and Windows Clippy. The audio flow and 76 existing menu states passed without JavaScript errors; browser mode without native capabilities was also checked.
- Local ignored evidence: `output/playwright/audio-validation.json` and `audio-*.png` captures.

Run the QA function with `playwright-cli run-code "$(cat scripts/qa-audio.js)"` against Vite in an isolated system Chrome session using `.playwright/cli.config.json`. Audio devices, volume and sleep in this script are **IPC fixtures**: it never changes Mac audio or puts a computer to sleep.

## Remaining hardware checks

On Windows 11, test speakers, HDMI/TV and Bluetooth headphones: audible changes, mute, all three default roles, disconnect during adjustment, changes from Windows settings, no device and audio-service restart. Check a physical controller, sleep confirmation/wake and open apps with their own routing. Browser tests and cross-compilation do not prove these behaviors.
