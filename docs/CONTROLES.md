# Keyboard and controller navigation

## Controls

| Keyboard | Controller | Action |
| --- | --- | --- |
| Arrows | D-pad / left stick | Move focus |
| Enter | A / Cross | Confirm or start/finish field editing |
| Backspace, Escape | B / Circle | Leave editing, then return to the previous menu |
| F1 | Start / Options | Open Settings from Home |
| Tab / Shift+Tab | — | Cycle controls within the open dialog |

Enter starts text editing and a second Enter finishes. Typing or clicking also starts editing. While editing, arrows move the caret and **Backspace deletes text** without leaving the menu. Escape or B / Circle ends editing. Shift+Enter adds a line in Arguments. Initial file selection uses Windows dialogs and may need keyboard/mouse.

For selects/sliders, arrows initially navigate. Enter / A / Cross starts adjustment; arrows change the value, then OK or Back finishes. Settings save automatically.

From the carousel, Up reaches the main button then header; Down opens the grid. From the last grid row, Down reaches Power and Up returns to cards. Closing a subpanel restores its opener. Confirmations start on **Cancel**. Held Enter/Back never repeatedly confirms or skips multiple menus.

## Historical validation — October 16, 2026

`scripts/qa-controls.js` checks focus paths across Settings, apps/order, URI/executable editors, import/long lists, updates, diagnostics, Power, tracked apps and confirmations. It repeats keyboard flows with the same `input` events emitted by the controller backend, covering fields, sliders/selects, nested Back, async focus, disabled buttons, held presses and Xbox/PlayStation hints.

**These events use a browser IPC fixture.** No Windows programs are launched/closed, and no power/update actions run. They validate frontend routing and interaction, not physical controllers, drivers or native dialogs. See `VALIDATION.md` for those checks.

Tests use installed Chrome, an isolated profile, desktop 1440×900 and mobile 390×844. `scripts/qa-ui.js` additionally covers real preview-storage import/save/removal, settings and native-unavailable messages. Header, Settings focus and Backspace were also inspected in the in-app browser.

```sh
# Start Vite in another terminal: npm run dev
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 ~/.codex/skills/playwright/scripts/playwright_cli.sh -s=controls open http://127.0.0.1:1420 --browser chrome --config .playwright/cli.config.json
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 ~/.codex/skills/playwright/scripts/playwright_cli.sh -s=controls run-code "$(cat scripts/qa-controls.js)"
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 ~/.codex/skills/playwright/scripts/playwright_cli.sh -s=controls close
```

Use a separate session for `qa-ui.js`: the controls fixture remains active until its session closes. Tests never reuse a personal Chrome profile.

## Card quick menu — October 16, 2026

On an added card, releasing a short Enter / A / Cross press opens the app. A 600 ms hold shows progress then the menu, without activation on release. Right-click, touch hold and X / Square also open it. System/suggestion cards keep their usual behavior.

The menu offers Edit, Move, confirmed Remove and applicable tracked-session actions. Moving retains the selected card even after renaming. Back/Escape or an outside click restores focus. Directional input, focus loss or controller cancellation interrupts a hold. Touch movement cancels the gesture, and the synthetic click after a hold is consumed.

Historical validation in isolated system Chrome:

- `scripts/qa-quick-menu.js`: desktop/mobile, carousel/grid, short/held keyboard and controller-event presses, repeats, cancellation, right-click, edit, move, cancelled/confirmed removal, session actions and DevTools-emulated touch. No extra launch on held release or JavaScript errors.
- All 76 existing controls-navigation states passed.
- `npm run check`: build/version consistency, 12 TypeScript and 12 Rust tests, including three press-arbitration tests.
- Rustfmt and Windows x64 cargo-xwin Clippy passed; desktop/mobile captures and the in-app browser were inspected.

IPC/touch simulation does not replace physical controller or native Windows testing. This historical validation itself did not publish a release. Run the quick-menu script with the same isolated CLI workflow using `scripts/qa-quick-menu.js`.
