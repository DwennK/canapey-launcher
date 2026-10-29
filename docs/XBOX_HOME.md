# Returning Home with the Xbox button

New configurations use `xbox`: press Xbox, with held Start + Back as a fallback. Existing preferences remain unchanged. `startBack`, `shouldersStart` and `disabled` remain available. The configurable duration applies only to button combinations. Returning to Canapey leaves the current application open and does not guarantee that it pauses.

## Implementation

- Foreground navigation uses gilrs / Windows Gaming Input.
- All four XInput slots are additionally read every 12 ms, independently of focus. Background combinations are tracked per controller; buttons from different controllers are never combined.
- Loads `xinput1_4.dll` exclusively from System32. The Guide extension at ordinal 100 is **undocumented by Microsoft** and also used by [SDL](https://github.com/libsdl-org/SDL/blob/main/src/core/windows/SDL_xinput.c). If absent, combinations fall back to `XInputGetState`, with Xbox detection shown as unavailable.
- An Xbox button held at startup, reconnection or mode change must be released before it can trigger Home. Holding never repeats Home. A read interruption longer than two seconds resets held-button state.
- The dedicated test listens for 15 seconds even if Game Bar takes focus. Receiving a press confirms detection only, without returning Home; it does not prove that Windows or Steam has no conflicting binding. Closing the panel cancels the test; a native timeout also stops listening if the frontend disappears.
- The general controller test suspends Xbox Home actions. Its own panel handles other buttons.
- The Game Bar button opens only `ms-settings:gaming-gamebar`. It does not modify the registry, uninstall anything or automatically disable Game Bar. Disabling the controller shortcut leaves Windows + G available.

## Limits and validation

Xbox-button detection and background XInput combinations require an XInput device. A PlayStation controller may need an appropriate driver/mapping; Canapey does not install one. WGI-only controllers retain navigation and existing combinations, but background reception depends on the driver. Windows, Steam Input and overlays can intercept the button. USB success does not prove Bluetooth support.

Local validation covered Rust press/hold logic, Windows cross-compilation and Clippy, and desktop/mobile UI tests. **No physical controller or native Windows interaction was validated in these local checks.**

Check on the target PC:

1. USB and Bluetooth: presses, nonrepeating holds, disconnection/reconnection while held.
2. Return from a game/app with Xbox and Start + Back; confirm the app remains open and can resume.
3. LB + RB + Start mode responds only to that shortcut; Disabled produces no global Home action.
4. Each combination must come from one controller.
5. Game Bar shortcut and Steam Input enabled/disabled; conflicts and Windows settings link.
6. Dedicated test success, timeout, cancellation, settings closure and switching to the general test.

References: [Windows settings URIs](https://learn.microsoft.com/en-us/windows/apps/develop/launch/launch-settings), [Game Bar](https://support.microsoft.com/en-gb/accessibility/windows/use-a-screen-reader-to-record-your-screen-with-xbox-game-bar), [gilrs Windows limitations](https://docs.rs/gilrs/latest/gilrs/).
