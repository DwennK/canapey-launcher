# Language support

English is currently the only available language. On the first launch after installation or upgrade, Canapey checks the WebView's system language list, selects a supported language (falling back to English), and saves it in `Settings.locale`. Existing libraries, shortcuts, favorites and other preferences remain unchanged. Subsequent launches keep the saved choice.

The preference is visible in **Settings → Display and ambience → Language**. The selector currently contains only English. The on-screen keyboard uses QWERTY. Physical keyboard shortcut capture continues to use physical key codes and supports other keyboard layouts.

## Adding another language later

- Add a catalog alongside `src/locales/en.json`. English source messages are the lookup keys; interpolate dynamic values with numbered placeholders rather than translating user data.
- Register the locale and its display name in `src/lib/i18n.ts`, and allow its value in the native settings validation in `src-tauri/src/model.rs`.
- Keep English as the fallback. Use the shared locale for dates, numbers and sorting. Resolve labels reactively rather than caching translated strings at module initialization.
- Translate native error messages through stable error codes before advertising complete support for another language; native messages are currently English.
- Verify first-run detection, existing-config migration, persistence, missing translations, layout and keyboard navigation. User-provided app names, file paths and OS-provided names must remain intact.

GitHub-facing documentation, commit messages, PRs and release notes are written in English. Historical commits and already published binaries are not rewritten by changing the current source tree.

## Validation — October 29, 2026

- `npm run check`: version consistency, production build, 89 frontend tests and 57 Rust host tests passed; one explicit network test remained ignored. Rustfmt and diff whitespace checks passed.
- `scripts/qa-language.js`: isolated system Chrome at 1440×1000 and 390×844; unsupported system language fallback, old-config migration, saved selection after reload, unchanged Unicode app name, QWERTY input and visible Skip 1s photo passed without JavaScript errors or horizontal overflow.
- `scripts/qa-remote-routing.js`: simulated native IPC confirmed short OK exactly once, held OK opening options, cancelled OK not launching, and suspended OK during remote editing. Desktop/mobile checks passed. This does not replace real HTPC testing.
- Five README captures regenerated from the English browser preview with sample web shortcuts. Settings also inspected in the in-app browser.
- The published v0.6.0 installer is unchanged and remains French. These source changes require a later installer release for HTPC testing.
