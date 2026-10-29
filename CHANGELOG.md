# Changelog

## Unreleased

- Remove duplicate Open / Resume and Actions buttons below the Home title; keep card activation and long-press actions.

- Simplify Controls into direct Controllers, Remote and iPhone tabs, with the iPhone page remembered after restart.

- Switch the interface, on-screen keyboard and native messages to English.
- Add first-launch language detection, an English fallback, a saved language preference and a Language selector in Settings. English is the only supported language for now; existing libraries and preferences are preserved.
- Introduce a frontend message catalog for future translations and use the selected locale for dates, numbers and sorting.
- Document English as the language for future GitHub content and refresh README screenshots.

## 0.6.0 — 2026-10-29

### Remote

- OK confirms in the active app: Enter outside Canapey, confirmation and long press inside it. Arrows and Back also target the active app. Only Home returns to Canapey; launcher panels no longer steal focus.
- An OK press keeps its recipient until release; repeats do not double-confirm. Losing focus cancels a confirmation started in Canapey.
- Existing bindings are preserved. Administrator windows and apps that ignore Windows key messages may reject these controls; physical HTPC testing remains necessary.

### YouTube

- Offer the YouTube card before installation, with bundled artwork and Install / Open actions.
- Detect and reuse VacuumTube, or install its latest stable GitHub release with progress, cancellation and SHA-256 verification before opening the Windows wizard.
- Avoid duplicate native entries, repair moved paths and preserve preferences. Existing web shortcuts remain available.
- Document validation and Windows limitations in `docs/YOUTUBE.md`.

### Library

- Load the first card rows immediately; fall back to bundled artwork when custom/theme images cannot decode. Changing artwork resets card errors.
- Restore the last removed card with its position, favorite and category from the library or Settings. Available during the session until dismissal or the next removal.
- Show filter counts and results out of the total; clear search without losing the category and provide specific help for empty favorites.
- Moving a card enables My order so that the move is visible.
- Pin the compatible SRP dependency in the Companion test oracle to restore pyatv CI interoperability.

### Interface and configuration

- Home focuses on running apps and favorites, with explicit library access and Open / Resume actions.
- Library search ignores accents; All / Favorites / Games / Video / Music / Other filters, sorting and editable categories are available.
- Group Settings into five sections, remember the last page and show save feedback/errors. Integrate the controller test and collapsible Xbox / Steam Input troubleshooting.
- Add a ten-button remote setup guide, resume unfinished steps and summarize bindings, preserving conflict checks and capture safeguards.
- Detect applications when Add first opens, focus search and show the number of apps to add.
- Enlarge text, controls and hints; show mobile navigation; move Windows desktop access into system controls. Preserve focus between subpages and support the on-screen keyboard in library search.
- Persist preferences with backward-compatible migration; see `docs/UX_SPRINT.md` for local validation.

## 0.5.0 — 2026-10-19

- Experimental native Rust iPhone remote: PIN pairing, Canapey/Windows navigation, Home and media controls. Disabled by default, private IPv4 networks only; real iPhone compatibility remains unverified.
- Dedicated settings, revocable devices and Windows DPAPI-protected identity.
- Companion interoperability tests with pyatv and documented upstream review before each release.

## 0.4.0 — 2026-10-17

- Separate Ambience tab with Living room, Emerald, Night and Twilight; fixed/app backgrounds, brightness, blur, motion and sound volume.
- Harmonize backgrounds/cards around the retained Spotify visual direction; give Silo a streaming theme.
- Redesign Settings and card menus for readability, action grouping and on-screen positioning.
- Fix double focus between a card and Settings; remove focus from the Canapey logo.
- Closing an app from Diagnostics keeps the panel open and restores focus to an available control.
- Show current volume in the header, move Power to the top right and remove Sleep from Quick controls.
- Place device identity before the bottom-left hints. Adapt labels for recognized Xbox, PlayStation and Nintendo controllers throughout menus and diagnostics.
- Add matching Canapey symbol, favicon and Windows icons; retain and slightly enlarge the “canapey.” wordmark.
- Format release notes for controller scrolling. Confirming an update requests normal closure of tracked apps and waits for exit, without forced termination or closing shared windows.
- Experimental Windows 11 x64 release. Physical controller/app testing remains pending; drivers exposing a controller as Xbox may hide its actual brand.

## 0.3.3 — 2026-10-17

- Add Task View (Windows + Tab), Close active window and Escape remote actions under Windows. They target the active window without returning to Canapey; closure remains graceful.
- Close session/card menus after successful close requests; keep them open on errors.
- Remove redundant See all from Home and simplify the update icon.
- Physical Windows remote testing for these actions remains pending.

## 0.3.2 — 2026-10-17

- Make all remote actions globally available, learning ordinary, navigation, numpad and media keys independently of the receiver. At this version, UI actions returned Canapey to the foreground; existing local bindings remained editable.
- Report Windows reservation conflicts and effects on physical keyboard use. Send media commands without key reinjection to avoid loops; detect Windows key aliases as duplicates.

## 0.3.0 — 2026-10-17

- Add confirmed Quit to the Power menu while leaving other apps open; remember the selected app across restarts.
- Add visual Skip 1s / Flirc configuration: clickable photo, learning and mapping for 34 controls, color mode, independent local/global bindings and legacy Home migration. Conflicts preserve previous settings; physical validation remains pending.
- Maximize tracked main windows on appearance/resume while preserving close controls. Exclude dialogs, fixed-size and shared windows; manual resizing remains possible afterward.
- Stabilize startup immediately: no initial fade or scrolling to the saved card; prioritize its artwork. Lazy-load keyboard/diagnostics; defer audio and tray initialization until the first frames.
- Add automatic startup phase logs. See `docs/STARTUP.md` for the Mac frontend benchmark; native Windows startup was not measured.
- Default new configurations to Xbox Home with Start + Back fallback. Retain Start + Back, LB + RB + Start and Disabled modes; add a 15-second detection test and Game Bar settings link. Physical Windows validation remains pending.
- Add a controller-accessible AZERTY on-screen keyboard with accents, uppercase, symbols, correction and cancellation.
- Add live controller diagnostics for buttons, sticks, triggers and filtered directions, deadzone adjustment between tests and held B / Circle to exit.
- Enable navigation sounds by default for new installations while preserving saved preferences.
- Resume tracked running apps with a short Enter / A / Cross press or click; keep closing/editing in the long-press menu.
- Hide system tools by default during import, with a checkbox to show them. Mark already-added apps and prevent reselection.
- Initially focus the display/startup category in Settings. Simplify Add by removing the manual web form/suggestions while retaining saved web shortcuts.
- Improve hover/selection with an inset focus border that stays inside the list.
- Fix Windows desktop access failing with “Class not registered: 0x80040154”.
- Add signed in-app updates for experimental `0.x` releases through a separate channel. Publish the channel only after verifying public assets; reject drafts, inconsistent assets and downgrades.
- v0.1.0 and v0.2.0 require one final manual installation to receive the updater.

## 0.2.0 — 2026-10-17

- Simplify interface copy with explicit titles/actions and remove decorative slogans/subtitles.
- Add the Quick controls side panel beside the clock: Windows volume, mute, output selection and confirmed sleep. Support keyboard/controller navigation, device refresh and focus restoration; physical Windows validation remains pending.
- Add card menus through a 600 ms Enter / A / Cross hold, right-click, touch hold or X / Square. Show hold progress and prevent launch on long-press release.
- Edit, move or confirm removal from a card; resume/close tracked sessions and preserve selection.
- Support directional/controller navigation across cards, buttons and fields. Enter confirms; Backspace returns outside text entry.
- Add explicit field editing, focus restoration, Cancel-first confirmations and hold guards.
- Automate 76 desktop/mobile UI states; physical Windows controller testing remains pending.

## 0.1.0 — 2026-10-16

First public Windows 11 x64 test prerelease.

- Living-room interface with carousel, grid, bundled ambience and keyboard/controller navigation.
- Manual entry and Windows app discovery, with YouTube, Netflix, Spotify and Internet web shortcuts.
- Settings, desktop access, app tracking and local configuration storage.
- Public sources, GitHub Actions Windows validation and synchronized npm/Tauri/Rust versions.

Experimental: interactive Windows/controller testing and performance measurements remained pending. No Authenticode signature; in-app updates were disabled in this prerelease.
