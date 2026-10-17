# Télécommande Skip 1s / Flirc

## Utilisation

1. Dans **Paramètres → Télécommande**, cliquez sur un bouton de la photo de la Skip 1s. Une liste « Bouton » permet aussi de le sélectionner.
2. Appuyez sur le bouton réel : Canapey apprend la touche clavier déjà envoyée par Flirc. Choisissez ensuite une action et cliquez sur **Enregistrer**.
3. Associez indépendamment navigation, Home, paramètres, bibliothèque, actions de carte, commandes rapides, menu d’alimentation, bureau, volume, lecture ou ouverture/reprise d’une application de la bibliothèque.
4. **Réapprendre la touche** modifie une association ; **Retirer l’association** la désactive sans toucher aux autres. Les associations sont conservées au redémarrage.

Le mode **Couleurs** de la photo expose les quatre commandes rouge, verte, jaune et bleue de la couronne. Les 34 commandes peuvent être associées ; les boutons A/B/C et le bouton de changement de mode couleurs restent gérés par la télécommande et sont expliqués dans l’interface. Les activités se configurent dans Skip App.

### Ce que Canapey apprend

Canapey reçoit des touches clavier, pas les signaux infrarouges. Chaque bouton doit donc déjà envoyer une touche ou un raccourci distinct via Flirc. Un bouton muet se programme d’abord dans le logiciel Flirc ; cette interface ne reprogramme pas le récepteur USB. Deux boutons envoyant la même touche sont indiscernables : l’interface refuse les associations en double.

Les flèches, Entrée, Échap et les touches ordinaires peuvent être associées **dans Canapey**. L’écoute prend priorité sur la navigation : Échap peut donc être appris. Elle s’arrête avec **Annuler l’écoute**, à la perte de focus, en quittant l’onglet ou après 15 secondes.

Pour Home, l’ouverture/reprise d’une application, le volume et la lecture, l’option **Même depuis une autre application** réserve un raccourci global Windows. Canapey doit rester ouvert. Utiliser un raccourci dédié, par exemple **Ctrl + Alt + H** ; les flèches et touches de saisie ne peuvent pas être interceptées globalement. Raccourcis globaux pris en charge : Ctrl + Alt + lettre/chiffre/touche de fonction (Maj facultative), ou Home, Pause, F2–F11, F13–F24 seuls. F12 reste réservé à Windows. Alt+Tab, Alt+F4, Ctrl+Maj+Q et les touches Windows ne sont pas réaffectables ici.

Les mêmes touches du clavier physique déclenchent les mêmes actions. Les touches multimédias déjà programmées dans Flirc agissent directement dans Windows : pour les réaffecter dans Canapey, programmer un raccourci clavier distinct afin d’éviter une double action.

Home remet Canapey au premier plan sans fermer l’application courante. Ouvrir/reprendre réutilise le comportement des cartes du launcher. Le bouton d’alimentation ouvre le menu existant, sans arrêter directement le PC.

## Implémentation

- `Settings.remoteBindings` conserve bouton, touche, action, portée et identifiant d’application éventuel. Les anciens `remoteHome` sont migrés vers une association Home globale.
- Les actions locales empruntent la navigation existante ; Valider conserve la gestion appui court / appui long. Le remappage est suspendu dans l’éditeur de télécommande et les champs de saisie.
- Le plugin officiel `tauri-plugin-global-shortcut`, limité à Windows, réserve uniquement les raccourcis globaux validés. Aucune permission générale d’enregistrement de raccourcis n’est exposée au JavaScript.
- Les nouvelles réservations précèdent la sauvegarde. Les anciennes sont libérées après sa réussite. Un conflit ou une erreur disque conserve toutes les anciennes associations et libère les nouvelles réservations temporaires.
- Au démarrage, les raccourcis disponibles restent actifs même si un autre est occupé. L’erreur est visible dans les réglages ; les sauvegardes sans changement de télécommande ne sont pas bloquées par ce conflit.
- La sauvegarde est sérialisée séparément du verrou de lecture de configuration pour éviter de bloquer les opérations du plugin sur le thread UI.
- L’écoute native permet de réapprendre un raccourci déjà réservé ; elle expire indépendamment après 20 secondes. Les répétitions sont filtrées par le plugin et par un délai entre appuis (100 ms pour volume, 500 ms pour les autres actions globales).
- Les commandes multimédias Windows émettent une paire appui/relâchement `SendInput`, limitée à sept touches volume/lecture. Aucun envoi arbitraire de touches n’est exposé.
- Photo réelle stockée localement pour fonctionner hors ligne ; provenance dans `public/devices/SOURCES.md`. Les zones cliquables suivent ses coordonnées, y compris lors du redimensionnement.

Références : [Flirc Skip 1s](https://flirc.tv/products/skip1s-remote), [activités Skip App](https://skip-org.gitbook.io/skip-remote-guide/creating-an-activity), [Tauri Global Shortcut](https://v2.tauri.app/plugin/global-shortcut/).

## Validation locale — 17 octobre 2026

- `npm run check` : build TypeScript/Vite, **52 tests JavaScript** et **27 tests Rust** réussis.
- Tests : validation locale/globale, disposition AZERTY, doublons, actions autorisées, migration, persistance, conflit de réservation partiel, échec disque, changement d’action sur une touche existante et retrait.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check` réussi.
- `PATH="/opt/homebrew/opt/llvm/bin:$PATH" cargo xwin clippy --manifest-path src-tauri/Cargo.toml --locked --target x86_64-pc-windows-msvc --all-targets -- -D warnings` réussi : vérification du code et des tests Windows depuis macOS, sans exécution sur Windows.
- `scripts/qa-remote.js` exécuté avec Chrome système et profil isolé : photo, zones cliquables, associations multiples, Échap, choix d’application, couleurs, doublon, conflit simulé, remplacement, capture native, rechargement, portée globale refusée sur flèche, annulation, perte de focus, expiration, changement d’onglet, exécution locale et retrait isolé d’une association.
- Vérification visuelle à **1440 × 900** et **390 × 844**, sans débordement horizontal ni erreur JavaScript.
- Captures dans `output/playwright/remote-full-desktop.png`, `remote-full-configured.png`, `remote-full-mobile-photo.png` et `remote-full-mobile-editor.png`. Le script simule les IPC natifs : les mentions « Global actif » sont des états de test, pas une preuve matérielle.

Rejouer après `npm run dev` :

```sh
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 ~/.codex/skills/playwright/scripts/playwright_cli.sh -s=canapey-map open http://127.0.0.1:1420 --browser chrome --config .playwright/cli.config.json
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 ~/.codex/skills/playwright/scripts/playwright_cli.sh -s=canapey-map run-code "$(cat scripts/qa-remote.js)"
```

## À vérifier sur le vrai PC Windows

- Programmer plusieurs boutons distincts dans Flirc ; associer Home, flèches/OK/Retour, une application, volume et lecture ; redémarrer Canapey et vérifier leur persistance.
- Revenir depuis une application normale, réduite, un navigateur et un jeu plein écran. Vérifier que l’application reste ouverte et que sa reprise fonctionne.
- Vérifier les quatre couleurs après changement de mode sur la Skip 1s, et les touches dans chaque activité A/B/C utilisée.
- Maintenir les boutons de navigation, OK, Home et volume, relâcher puis réappuyer : pas de touche bloquée, appui long OK correct, pas de retour Home en rafale.
- Vérifier volume/lecture dans les applications réelles, y compris les restrictions d’injection Windows si l’application est élevée.
- Réapprendre un bouton déjà actif, remplacer son raccourci et vérifier que l’ancien est libéré ; retirer une association et vérifier les autres.
- Réserver un raccourci dans une autre application : erreur à l’association ; au démarrage, état inactif visible sans bloquer les autres raccourcis ni les réglages.
- Quitter Canapey, débrancher/rebrancher Flirc, mettre le PC en veille puis le réveiller et refaire les essais.
- Les restrictions de focus de Windows restent applicables aux applications élevées et jeux exclusifs ; Canapey conserve son message de repli si Windows refuse le premier plan.

Aucune publication ni livraison Windows n’est réalisée par cette modification locale.
