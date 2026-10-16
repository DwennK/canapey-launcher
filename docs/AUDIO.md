# Commandes rapides — 16 octobre 2026

Le bouton audio à gauche de l’heure ouvre un panneau latéral : volume général de la sortie Windows par défaut, muet, sorties connectées et veille avec confirmation. L’heure reste informative.

- Haut/bas parcourt les commandes dans l’ordre. Gauche/droite règle le volume de 2 points lorsque la barre est sélectionnée, sans mode d’édition supplémentaire.
- A/Croix ou Entrée active une commande. B/Rond ou Échap ferme le panneau et restaure le focus. La confirmation de veille commence sur Annuler.
- Le volume et les sorties sont relus toutes les deux secondes lorsque Canapey est visible et au premier plan, ainsi qu’à l’ouverture du panneau. Les changements externes et déconnexions sont ainsi reflétés.
- Les écritures audio sont sérialisées ; les mouvements rapprochés du curseur sont regroupés. Une ancienne commande conserve son identifiant de sortie, et Windows refuse un réglage de volume/muet si cette sortie n’est plus la sortie par défaut.
- Le mode navigateur indique que les commandes Windows sont indisponibles et ne simule aucun périphérique.

## Intégration Windows

Le volume et le muet utilisent Core Audio (`IMMDeviceEnumerator`, `IAudioEndpointVolume`), sans PowerShell ni programme auxiliaire. Les objets COM sont créés et libérés sur le même thread de travail ; les chaînes et PROPVARIANT sont libérés.

Le changement de sortie utilise l’interface COM **non documentée** `IPolicyConfig::SetDefaultEndpoint`, également employée par [EarTrumpet](https://github.com/File-New-Project/EarTrumpet/blob/master/EarTrumpet/Interop/MMDeviceAPI/IPolicyConfig.cs). Les trois rôles Windows (console, multimédia et communications) sont modifiés. En cas d’échec partiel, les anciens rôles sont restaurés au mieux et une erreur est affichée. Cette interface interne reste une dépendance de compatibilité à vérifier lors des évolutions Windows. Les applications qui imposent leur propre périphérique peuvent conserver leur routage.

Référence Microsoft : [contrôle du volume des périphériques](https://learn.microsoft.com/en-us/windows/win32/coreaudio/endpoint-volume-controls).

## Vérification locale

- `npm run check` : compilation et tests TypeScript/Rust.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`.
- `cargo check --manifest-path src-tauri/Cargo.toml --locked` sur macOS.
- `PATH="/opt/homebrew/opt/llvm/bin:$PATH" cargo xwin clippy --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-msvc --all-targets -- -D warnings` : vérification du code Windows et de ses tests par compilation croisée, sans exécution Windows.
- `tests/audio.test.ts` : regroupement des mouvements rapides, sérialisation lecture/écriture, conservation de l’identité du périphérique, erreurs et récupération.
- `scripts/qa-audio.js` : Chrome système isolé, desktop 1440×900 et mobile 390×844. Navigation clavier et événements IPC manette de test, volume, muet, choix de sortie, annulation/confirmation de veille, déconnexion, noms longs, défilement et restauration du focus.

```sh
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 ~/.codex/skills/playwright/scripts/playwright_cli.sh -s=canapey-audio open http://127.0.0.1:1420 --browser chrome --config .playwright/cli.config.json
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 ~/.codex/skills/playwright/scripts/playwright_cli.sh -s=canapey-audio run-code "$(cat scripts/qa-audio.js)"
```

Les périphériques, le volume et la veille du script navigateur sont des **fixtures IPC**. Il ne modifie pas le son du Mac et ne met aucun ordinateur en veille. Les captures `output/playwright/audio-*.png` sont des aperçus de cette fixture.

Résultat local : 17 tests TypeScript et 13 tests Rust réussis, compilation frontend/macOS et Clippy Windows réussis. Le nouveau parcours audio et les 76 états des menus existants passent dans Chrome sans erreur JavaScript. Le mode navigateur sans fonctions natives a également été vérifié. Résumé de cette exécution : `output/playwright/audio-validation.json` (artefact local ignoré par Git).

## Essais matériels restant à effectuer

Sur un vrai Windows 11, vérifier les haut-parleurs, HDMI/TV et casque Bluetooth : variation audible, muet, changement des trois rôles Windows, déconnexion pendant un réglage, changement depuis les paramètres Windows, absence de périphérique et arrêt/reprise du service audio. Vérifier aussi la manette physique, la confirmation de veille, le réveil et les applications déjà ouvertes ayant un routage spécifique. Les tests navigateur et la compilation croisée ne prouvent pas ces comportements matériels.
