# Navigation clavier et manette

## Commandes

| Clavier | Manette | Action |
| --- | --- | --- |
| Flèches | Croix directionnelle / stick gauche | Déplacer le focus |
| Entrée | A / Croix | OK : activer le bouton ou commencer/terminer le réglage d’un champ |
| Retour arrière (⌫), Échap | B / Rond | Quitter le réglage en cours, puis revenir au menu précédent |
| F1 | Start / Options | Ouvrir les paramètres depuis l’accueil |
| Tab / Maj+Tab | — | Parcourir les contrôles ; le focus reste dans le dialogue ouvert |

Sur un champ texte, Entrée commence la saisie et une seconde Entrée la termine. Une frappe ou un clic commence également la saisie. Pendant la saisie, les flèches déplacent le curseur et **Retour arrière efface le texte**, sans quitter le menu. Échap ou B/Rond quitte la saisie. Maj+Entrée ajoute une ligne dans le champ Arguments. Le choix initial de fichiers utilise les dialogues Windows et peut nécessiter clavier/souris.

Sur une liste déroulante ou un curseur, les flèches servent d’abord à naviguer. Entrée / A / Croix active le réglage, les flèches changent la valeur, puis OK ou Retour termine le réglage. Les changements de paramètres sont enregistrés automatiquement.

Depuis le carrousel, Haut atteint le bouton principal puis l’en-tête ; Bas ouvre la grille. Depuis la dernière rangée de la grille, Bas atteint l’alimentation ; Haut revient aux cartes. Le retour depuis une sous-fenêtre restaure le bouton qui l’a ouverte. Les confirmations commencent sur **Annuler**. Un appui prolongé sur Entrée ou Retour ne valide pas plusieurs fois et ne traverse pas plusieurs menus.

## Vérification du 16 octobre 2026

Le script `scripts/qa-controls.js` vérifie les chemins de focus entre tous les contrôles activables des panneaux : paramètres, applications et ordre, éditeurs URI/exécutable, import et listes longues, mises à jour, diagnostic, alimentation, applications suivies et confirmations. Il rejoue les parcours avec les touches du clavier puis avec les mêmes événements `input` que ceux émis par le backend manette. Il vérifie aussi les champs, l’édition de curseurs/listes, les retours imbriqués, le focus après une opération asynchrone, les boutons désactivés, les appuis prolongés et les indications Xbox/PlayStation.

**Ces événements sont injectés via une fixture IPC dans un navigateur de test.** Aucun programme Windows n’est lancé/fermé, aucune action d’alimentation ou mise à jour n’est exécutée. Cela valide le routage et les interactions de l’interface, pas une manette physique, ses pilotes, ni les dialogues natifs Windows. Ces derniers restent dans la matrice de `VALIDATION.md`.

Les vérifications utilisent Google Chrome installé, un profil isolé, un viewport desktop de 1440×900 et un viewport mobile de 390×844. Le parcours existant `scripts/qa-ui.js` vérifie en complément l’import réel dans le stockage de prévisualisation, la sauvegarde, le retrait, les réglages et les messages d’indisponibilité native. L’en-tête, le focus dans les paramètres et Retour arrière ont aussi été inspectés dans le navigateur intégré.

```sh
# Démarrer Vite dans un autre terminal : npm run dev
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 ~/.codex/skills/playwright/scripts/playwright_cli.sh -s=controls open http://127.0.0.1:1420 --browser chrome --config .playwright/cli.config.json
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 ~/.codex/skills/playwright/scripts/playwright_cli.sh -s=controls run-code "$(cat scripts/qa-controls.js)"
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 ~/.codex/skills/playwright/scripts/playwright_cli.sh -s=controls close
```

Utiliser une session distincte pour `qa-ui.js` : la fixture IPC de `qa-controls.js` reste active jusqu’à la fermeture de sa session. Les tests ne réutilisent jamais le profil Chrome personnel.

## Menu rapide des cartes — 16 octobre 2026

Sur une carte ajoutée, Entrée ou A / Croix ouvre l’application au relâchement d’un appui court. Un maintien de 600 ms affiche une barre de progression puis le menu, sans activation au relâchement. Le clic droit, l’appui long tactile et X / Carré ouvrent également ce menu. Les cartes système et les suggestions conservent leur comportement habituel.

Le menu propose Modifier, Déplacer, Retirer avec confirmation et les actions applicables aux sessions suivies. Le déplacement conserve la carte sélectionnée, même après renommage ; Retour / Échap ou un clic extérieur restaure son focus. Une direction, une perte de focus ou une annulation manette interrompt le maintien. Le déplacement tactile annule le geste, et le clic synthétique suivant un appui long est consommé avant de pouvoir activer le menu.

Validation exécutée avec Chrome système isolé :

- `scripts/qa-quick-menu.js` : desktop 1440×900 et mobile 390×844, carrousel/grille, pressions courtes/longues clavier et événements manette, répétition, annulation, clic droit, modification, déplacement, retrait annulé/confirmé, actions de session et tactile émulé via Chrome DevTools. Aucun lancement supplémentaire au relâchement long ; aucune erreur JavaScript.
- `scripts/qa-controls.js` : les 76 états de navigation existants passent également, sans erreur JavaScript.
- `npm run check` : build et cohérence de version, 12 tests TypeScript et 12 tests Rust réussis, dont 3 tests d’arbitrage des appuis.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check` et Clippy Windows x64 via cargo-xwin : réussis.
- Rendu inspecté sur les captures desktop/mobile et dans le navigateur intégré.

Ces contrôles simulent l’IPC et le tactile : ils ne remplacent pas un essai avec une manette physique ni l’exécution native sous Windows. Aucun push ni publication n’est associé à cette validation locale.

```sh
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 ~/.codex/skills/playwright/scripts/playwright_cli.sh -s=quick open http://127.0.0.1:1420 --browser chrome --config .playwright/cli.config.json
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 ~/.codex/skills/playwright/scripts/playwright_cli.sh -s=quick run-code "$(cat scripts/qa-quick-menu.js)"
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 ~/.codex/skills/playwright/scripts/playwright_cli.sh -s=quick close
```
