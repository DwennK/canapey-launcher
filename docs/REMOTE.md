# Skip 1s / Flirc remote

## Usage

**Set up essential buttons** walks through Home, directions, OK, Back and volume. Each binding is saved before advancing. Skip creates no binding; resuming starts at the first unconfigured button. Custom bindings remain available in the form and summary.

1. Open **Settings → Controls → Remote** and click a button on the Skip 1s photo, or select it in the Button list.
2. Press the physical button: Canapey learns the keyboard key already sent by Flirc. Choose an action and **Save**.
3. Map navigation, Home, Settings, Library, card actions, Quick controls, Power, desktop, volume, playback or opening/resuming a library app independently.
4. **Relearn key** changes a binding; **Remove binding** disables only that binding. Bindings survive restarts.

**Colors** exposes the ring's red, green, yellow and blue controls. There are 34 assignable controls. A/B/C and the color-mode switch remain hardware-managed and are explained in the interface. Configure activities in Skip App. The photo is available outside the optional step-by-step guide; on narrow screens, use **Choose on the remote**.

### What Canapey learns

Canapey receives keyboard keys, not infrared signals. Each physical button must already send a distinct key/shortcut through Flirc. Configure silent buttons in Flirc first; Canapey does not reprogram the USB receiver. Two buttons sending the same key are indistinguishable, so duplicate bindings are rejected.

Every action offers **Enable throughout Windows**, enabled by default for new bindings. Canapey must remain running, even minimized. Arrows, Enter, Escape, letters, digits, numpad, function and media keys are accepted when Windows can reserve them. Windows keys, F12 and certain system combinations remain excluded. An occupied shortcut reports an error and preserves existing bindings.

The same physical keyboard keys are affected. Global reservations can replace their usual behavior in other apps; the interface explains this before saving. Disable the option for local use. **Existing local bindings are preserved** and must be saved again with the option enabled to become global.

Learning takes priority over navigation, allowing Escape to be captured. It stops on Cancel, focus loss, tab exit or after 15 seconds. The source device is not identified: Flirc, another receiver and a keyboard all send equivalent keys.

Global navigation targets the active application: **Confirm / OK → Enter**, directions → arrows, **Back → Escape**. Inside Canapey, navigation and held OK for card options remain available. Only **Return to Canapey (Home)** recalls the launcher; panel commands (Settings, Library, options, audio, Power) do nothing while Canapey is in the background. Administrator windows and apps that ignore Windows key messages may reject these commands. Remapped media keys become Windows media commands without keyboard reinjection, avoiding shortcut loops.

Home brings Canapey forward without closing the current app. Open/resume uses normal launcher-card behavior. Power opens the existing menu and never shuts the PC down directly.

## Implementation

- `Settings.remoteBindings` stores button, key, action, scope and optional app ID. Legacy `remoteHome` migrates to a global Home binding.
- A worker orders press/release events without blocking the UI. Canapey actions use `remote-action`; a confirmation started there is cancelled on release if focus changed. External confirmation retains its recipient through release, without global shortcut reinjection or repeated OK. Interface actions pause in the remote editor; Home/media remain global.
- The official Windows-only `tauri-plugin-global-shortcut` reserves validated global shortcuts. JavaScript receives no general shortcut-registration permission.
- New reservations precede saving; previous reservations are released only after success. Conflicts/disk failures preserve all previous bindings and release temporary new reservations.
- At startup, available shortcuts remain active even if another is occupied. Settings show the error; unrelated saves are not blocked.
- Saving is serialized separately from the configuration read lock so plugin operations do not block the UI thread.
- Native listening can relearn an already-reserved shortcut and expires independently after 20 seconds. Plugin repeat filtering is supplemented by 100 ms between volume/direction presses and 500 ms for other actions; Confirm carries both transitions.
- Seven media commands use `WM_APPCOMMAND` with a one-second timeout, without `SendInput`. Windows Enter/numpad Enter and Pause/MediaPause aliases share reservations.
- The genuine product photo is bundled for offline use; see `public/devices/SOURCES.md`. Click targets follow its coordinates when resized.

References: [Flirc Skip 1s](https://flirc.tv/products/skip1s-remote), [Skip App activities](https://skip-org.gitbook.io/skip-remote-guide/creating-an-activity), [Tauri Global Shortcut](https://v2.tauri.app/plugin/global-shortcut/).

## Historical local validation — October 17, 2026

- `npm run check`: TypeScript/Vite build, **52 JavaScript tests** and **28 Rust tests** passed.
- Covered local/global validation, AZERTY physical-key capture, duplicates, allowed actions, migration, persistence, partial reservation conflicts, disk failure, replacing an action on an existing key and removal.
- Rustfmt passed. `PATH="/opt/homebrew/opt/llvm/bin:$PATH" cargo xwin clippy --manifest-path src-tauri/Cargo.toml --locked --target x86_64-pc-windows-msvc --all-targets -- -D warnings` checked Windows code/tests from macOS without Windows execution.
- `scripts/qa-remote.js` in isolated system Chrome covered the photo/hit areas, multiple bindings, Escape, app selection, colors, duplicates, simulated conflicts, replacement, native capture, reload, global arrow scope, cancellation, focus loss, timeout, tab changes, native Library/Settings events, short/long local confirmation, Quick controls/Power, Back and isolated removal.
- Visually checked **1440×900** and **390×844** without horizontal overflow or JavaScript errors.
- Captures: `output/playwright/remote-full-desktop.png`, `remote-full-configured.png`, `remote-full-mobile-photo.png`, `remote-full-mobile-editor.png`. Native IPC is simulated; “Global active” is a fixture state, not hardware evidence.

Run against Vite with `playwright-cli run-code "$(cat scripts/qa-remote.js)"` in an isolated system Chrome session using `.playwright/cli.config.json`.

## Remaining physical Windows checks

- Program distinct Flirc buttons; map Home, arrows/OK/Back, an app, volume and playback; restart and verify persistence.
- Return from normal/minimized apps, a browser and a fullscreen game; confirm the app stays open and resumes.
- Check four colors after switching Skip 1s mode and each A/B/C activity in use.
- Hold/release/repress navigation, OK, Home and volume: no stuck keys, correct OK hold and no repeated Home.
- Check actual media apps, including elevated-window restrictions.
- Relearn/replace an active binding and confirm its previous shortcut is released; removing one must preserve others.
- Reserve a shortcut elsewhere: mapping should report conflict; startup should show it inactive without blocking other bindings/settings.
- Quit, reconnect Flirc, sleep/wake the PC and repeat.
- Windows focus restrictions still apply to elevated apps and exclusive games; Canapey retains a fallback message if foreground activation is refused.

Local tests do not prove focus, receiver or media-app behavior on real hardware.
