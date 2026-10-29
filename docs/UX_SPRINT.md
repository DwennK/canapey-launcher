# UX sprint — October 29, 2026

Historical delivery record: initial work was local at version 0.5.0, with no local Windows installer build/install. The sprint was then committed and pushed (`a67e379`, `e7b2986`, `fc65b09`). Windows [run 40795854630](https://github.com/DwennK/canapey-launcher/actions/runs/40795854630) passed, including an unsigned test installer. The pre-existing Companion failure was fixed separately in `c124046`; the complete local oracle and CI Companion job passed. No release or local installation accompanied that sprint push. The later work below was grouped into a separate UX commit from YouTube integration and subsequently included in v0.6.0.

## Second iteration

### Missing card images

The eight pictured cards already had photographic assets in `public/art/`; no ImageGen generation was needed. Files were inspected and all eight thumbnails decoded at 640×360. Initial rows now load immediately while later cards remain lazy. The previous error handler could hide an image permanently after a source change; it was replaced with custom → theme → Living room fallback and error reset on source changes. Fullscreen backgrounds also try bundled alternatives before abandoning a failed file.

Build and 81 TypeScript tests passed. Isolated Chrome at 1440×1000 and 390×844 checked eight visible backgrounds, immediate loading, deliberately corrupt images, Living room fallback, reload recovery, failed custom cards/backgrounds, theme changes after errors and preserved logo identity. Evidence: `output/playwright/artwork-fix/`, two scripts with `passed: true`; final captures followed viewport stabilization.

The pushed sprint's final remote [run 40796398721](https://github.com/DwennK/canapey-launcher/actions/runs/40796398721) passed Windows and Companion jobs and generated an unsigned test installer. That run did not yet contain the later library changes below.

- Restore the last removed card with its position, favorite and category without reverting later edits. The notice remains in Library and Apps settings until dismissal, another removal or restart. Save failure leaves the card removed and permits retry; duplicates/capacity remain guarded.
- Category counts include search, results show the total, clearing search keeps the category and restores field focus. Empty favorites have specific help.
- Moving a card enables custom sorting, preventing invisible moves under alphabetical sorting; the form explains this.
- Build/version checks and 79 TypeScript tests in 14 files passed for the library iteration. Isolated Chrome at 1440×900 and 390×844 covered removal, Cancel default, restoration/metadata, failure/retry, final card, keyboard navigation, reload, Apps settings, filters and focus. No console errors/warnings; filters also checked in the in-app browser.
- Evidence: `output/playwright/ux-iteration/`, two flow scripts with explicit `passed: true`; captures waited for panels/notifications to close.
- No Rust changed in that iteration. The CI correction pins development-only `srptools==1.0.1` for pyatv 0.18.0's constructor; shipped dependencies are unchanged. The complete local oracle passed wrong PIN, pairing, encrypted verification, commands, reconnection and revocation.
- Cleanup removed the dedicated Cargo target, isolated Python environment and `dist/`, reclaiming 501.2 MiB while preserving sources/shared dependencies/evidence/Vite preview.

## Changes

- Home shows running apps then favorites without duplicates, or the first six apps when neither exists. Explicit Open / Resume, Actions and Library card.
- Library has accent-insensitive search, All / Favorites / Games / Video / Music / Other filters and custom/name/category sorting. Automatic categories use name/target, never artwork; the editor allows overrides. Favorites are available through card actions and app management.
- Five Settings sections with saved last page, save feedback and visible errors restoring previous values: Display and ambience, Apps, Controls, Startup and system, Help and updates.
- Inline controller test and collapsible Xbox / Steam Input help; existing capture-stop behavior retained.
- Ten-essential-button remote guide with per-step saving, optional skip, first-unconfigured-step resume, binding summary and custom form. Conflicts block saving; leaving/skipping creates no binding.
- Add detects on first opening, focuses search, caches session results, retries errors and labels the number of apps to add.
- Larger copy/controls, visible mobile navigation, restored subpage focus and on-screen library keyboard. Windows desktop access moved into Power/system settings.

## Persistence and compatibility

`Settings.library` stores favorites, categories and sorting; `lastSettingsTab` stores the Settings page. Serde defaults load older configurations. Tests cover save/reload and invalid categories. Preview storage normalizes missing/malformed preferences. No Windows user data files were touched during local validation.

## Initial sprint validation

- `npm run check`: versions, frontend build, TypeScript and Rust tests passed. Final frontend corrections were followed by build, tests, version check and Rustfmt.
- Initial sprint result: 75 TypeScript tests in 13 files, 48 Rust tests (`--no-default-features` on macOS).
- Isolated system Chrome at 1440×900 and 390×844; additional 1920×1080 check with 140% text and reduced-motion preference.
- Favorites, accented search, combined filters, empty results, sorting, category editing, reload persistence, subpages/focus, virtual keyboard with inert background and first grid row → search.
- Guide: preview keyboard learning, shortcut conflict, saving, skipping/resuming and exit focus. No Windows system reservation occurred.
- Save success and simulated storage failure/restoration. Power confirmations focused Cancel without performing system actions.
- Mocked Windows bridge only for automatic detection, failure/retry, multi-import, selecting the first imported card, deduplication, cached detection and running-session presentation; removed after testing.
- Additional in-app browser inspection; no final console errors/warnings.

Local scripts/results/captures: `output/playwright/ux-sprint/` (Git-ignored), including `rapport.html`. Initial assertions were adjusted to await transitions and target exact accessible names; final flows passed.

## Limits

App launch/closure, real discovery, global shortcuts, audio outputs, physical controllers, Skip 1s / Flirc and iPhone still need interactive Windows testing. Browser/mocked-bridge checks do not prove native behavior. No accessibility certification or physical TV-distance readability measurement.

## Storage

The initial sprint's dedicated Cargo outputs and `dist/` were removed after validation, reclaiming about 497 MiB (exact measurement: `output/playwright/ux-sprint/cleanup.txt`). Sources, dependencies, captures and Vite preview were preserved.
