# Canapey Launcher — delivery and versions

- Reply to the user in French. Preserve other tasks' changes; inspect status and diffs before editing or committing.
- Write application copy, documentation, comments, commit titles/bodies, PR descriptions, issues and release notes in English. English is currently the only supported UI language; keep new frontend messages in `src/locales/en.json` through `t()`. Do not translate user data or operating-system application names. Future locales must use first-launch detection and the saved language preference.
- The public repository is `DwennK/canapey-launcher`. Push or publish only when authorized.
- The first release is `v0.1.0`. Keep the experimental `0.x.y` series; use `1.0.0` only on explicit request.
- For each requested publication, choose the version without asking again: patch for fixes/small improvements, minor for substantial features or breaking changes during the experimental phase. Resume an unfinished publication with its existing version.
- Use `npm run version:bump -- patch` or `npm run version:bump -- minor`. The script synchronizes five version files; `npm run version:check` checks consistency. Never move a published tag.
- Update `CHANGELOG.md` and the README version/download link, run `npm run check` and `cargo fmt --manifest-path src-tauri/Cargo.toml --check`, then create coherent commits with English titles and bodies. Stage only relevant changes.
- For an authorized release: push commits and an annotated `vX.Y.Z` tag, wait for Windows CI and the release workflow, inspect the draft's assets and notes, then publish it. All `0.x` releases are GitHub prereleases.
- Experimental `0.x` releases use signed Tauri updates and require Actions signing keys. Never commit private keys. After publication, wait for `Publish experimental update channel` and verify `updates/0.x.json` and its downloads. The channel must never point to a draft or move backwards. Authenticode signing is separate.
- Verify the public repository, tag, commit, published release and downloads. Distinguish Windows compilation, automated tests and interactive testing on a real PC.
- For visual changes, check desktop (at least 1440×900 by default) and mobile with system Chrome, Playwright and an isolated profile. Do not download Chromium or access personal profiles.
- Before every release, review updates to `aryakvn/windows-apple-remote` and the Companion implementation in `postlund/pyatv` using `docs/APPLE_REMOTE.md`. Track the latest reviewed revision separately from the latest actually ported revision, with accepted/rejected fixes and tests. A review alone must never advance the integrated revision. Do not automatically port upstream changes.
