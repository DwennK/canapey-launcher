# Validation — 16 octobre 2026

Ce rapport conserve les preuves de la livraison locale initiale, avant publication. Les résultats Windows de chaque commit et tag sont disponibles dans [GitHub Actions](https://github.com/DwennK/canapey-launcher/actions) ; les installateurs publics se trouvent dans [Releases](https://github.com/DwennK/canapey-launcher/releases). La compilation et les tests automatisés ne remplacent pas la matrice d’essais matériels ci-dessous.

## Ajout du 17 octobre 2026 — canal de mise à jour 0.x

- Configuration de signature provisionnée dans GitHub Actions : clé privée et mot de passe en secrets, clé publique en variable. Paire vérifiée par signature d’un fichier de contrôle puis vérification Ed25519 et du commentaire signé ; copies privées temporaires supprimées.
- `npm run check` : build réussi, 37 tests JavaScript (dont 20 pour les mises à jour) et 13 tests Rust réussis. Couverture du choix de canal, des clés absentes/invalides, de la promotion après publication, de l’intégrité des fichiers, des erreurs réseau et du refus de rétrograder le canal.
- Workflows vérifiés avec Actionlint ; `cargo fmt --check` et `cargo check --locked` avec la configuration de release générée réussis sur macOS.
- Aucune nouvelle release publiée pour cette modification. Le premier manifeste public sera créé après publication de la première prérelease signée. L’installation et la mise à jour de bout en bout sur Windows restent à tester.
- Les résultats ci-dessous décrivent la livraison initiale du 16 octobre et ne constituent pas une validation du nouveau canal.

## Ce qui a réellement été exécuté

Environnement : macOS ARM64, Node 26, Rust 1.94.1. Compilation croisée avec cargo-xwin déjà présent, LLVM 23 installé via Homebrew et NSIS 3.13 déjà présent. Le PATH de compilation a été limité aux commandes, sans modifier le profil shell. Tests de navigateur avec **Google Chrome système**, contexte isolé sans profil personnel. Aucun téléchargement de Chromium Playwright.

| Vérification | Résultat |
| --- | --- |
| `npm run build` | Compilation TypeScript/Vue/Vite réussie |
| `npm test` | 9 tests de navigation, sélection, grille incomplète, resize, identité d’import et cohérence de version réussis |
| `cargo test --no-default-features` | 12 tests Rust de configuration, validation, déduplication, répétition, hystérésis, maintien et suivi de processus réussis |
| `cargo check` sur macOS | Compilation complète du runtime Tauri réussie ; plateforme native Windows désactivée |
| `cargo xwin clippy --target x86_64-pc-windows-msvc --all-targets -- -D warnings` | Code spécifique Windows et tests compilés, aucun avertissement Clippy |
| `tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc --bundles nsis` | Binaire Windows x64 et installateur NSIS produits, sans signature Authenticode |
| Contrôle Playwright 1440×900 et 390×844 | Parcours interface réussis, aucune erreur JavaScript, aucune requête externe |
| Inspection visuelle | Accueil, grille, paramètres desktop/mobile ; accueil également inspecté dans le navigateur intégré |
| `npm audit` | Aucune vulnérabilité signalée lors de la livraison |

**La compilation croisée ne constitue pas un test d’exécution Windows.** Le workflow Windows est prêt, mais n’a pas été exécuté sur GitHub dans cette session (aucun dépôt distant fourni). Aucun résultat de performance native n’est annoncé.

Les tests d’interface couvrent :

- Déplacement horizontal, maintien de la carte entièrement visible, changements rapides de fond.
- Carrousel → grille → retour, sélection conservée, haut de première ligne.
- Ajout volontaire de Netflix, YouTube, Spotify et Internet comme **raccourcis web**, jamais comme logiciels détectés. Vérification des cibles, des ambiances, de la persistance et de la déduplication de Spotify.
- Modification du nom, changement d’ordre, sauvegarde et restauration après rechargement.
- Annulation puis confirmation du retrait d’une carte.
- Message d’indisponibilité pour un lancement natif depuis le navigateur.
- Réglages de contrôle, état de mise à jour non configurée, confirmation d’arrêt **annulée**.
- Configuration navigateur invalide récupérée et interface chargée sans aucun hôte distant.
- Rendu mobile sans débordement horizontal de la page.

Le test « sans réseau externe » bloque tous les hôtes sauf le serveur local de développement. Il prouve l’autonomie des ressources de l’interface ; l’essai complet hors ligne de l’application installée reste dans la matrice Windows ci-dessous.

## Rejouer l’interface

Lancer `npm run dev`. Avec le skill Playwright installé :

```sh
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 ~/.codex/skills/playwright/scripts/playwright_cli.sh -s=canapey open http://127.0.0.1:1420 --browser chrome --config .playwright/cli.config.json
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 ~/.codex/skills/playwright/scripts/playwright_cli.sh -s=canapey run-code "$(cat scripts/qa-ui.js)"
```

La configuration fixe le viewport à 1440×900 **avant** le chargement. Le script efface uniquement la clé `canapey-ui-preview-v1` du navigateur de test, crée ses propres données et les retire en fin de test. Il ne lance ni ne ferme de logiciel Windows et ne déclenche aucune action d’alimentation. Les captures sont écrites dans `output/playwright/` (ignoré par Git).

## Matrice à terminer sur un vrai Windows 11 x64

| Parcours | Procédure et résultat attendu | Statut |
| --- | --- | --- |
| Installation / première ouverture | Installer par utilisateur, ouvrir ; aucun flash blanc, accueil visible sans scan. Vérifier version Windows / arch. | À tester |
| Exécutable classique | Importer une app de test avec fenêtre ; lancer, revenir avec Start+Back, reprendre, demander fermeture ; retour automatique et bonne sélection. | À tester |
| Bootstrapper / enfant | Lancer un logiciel dont le premier PID se termine ; sa fenêtre enfant reste suivie, pas de retour prématuré. | À tester |
| Instance déjà ouverte | Ouvrir l’app avant Canapey, activer sa carte ; reprendre l’instance exacte, fermeture normale seulement, aucune destruction forcée d’une instance préexistante. | À tester |
| App non réactive | App de test contrôlée sans données importantes : WM_CLOSE, attente de 5 s, confirmation explicite de fermeture forcée. Vérifier PID et heure de création. | À tester |
| Navigateur partagé | Ouvrir plusieurs pages avant un raccourci web ; Canapey indique le suivi limité, ne ferme ni ne tue les autres pages. | À tester |
| App Store / Steam | Importer les identités détectées ; vérifier activation, fenêtre et retour. Documenter tout lanceur indirect non associable. | À tester |
| Manette Xbox / PlayStation | USB et Bluetooth si disponibles : D-pad, stick, deadzone, A/Croix, B/Rond, Start ; maintien régulier sans doublon ni rafale. | À tester |
| Reconnexion / veille | Débrancher/rebrancher, puis réveiller le PC ; manette reconnue, aucune touche bloquée, relâchement exigé après retour. | À tester |
| App en premier plan | Maintenir les directions dans une autre app ; Canapey ne navigue pas. Seule la combinaison configurée réaffiche l’accueil. | À tester |
| Refus de focus | Tester jeu exclusif ou app élevée ; repli barre des tâches et message, aucune promesse de contournement Windows. | À tester |
| TV absente | Sélectionner la TV, fermer Canapey, débrancher la TV, rouvrir ; écran principal. Débrancher également pendant l’usage puis reconnecter. | À tester |
| DPI / résolution | 1080p/4K, 100/150/200 % DPI, réglages de taille 80–140 %, grille et carrousel sans perte de sélection. | À tester |
| Session Windows | Activer démarrage automatique, se déconnecter/reconnecter ; une seule instance. Désactiver, vérifier absence au prochain login. | À tester |
| Bureau / réouverture | Retour Windows montre le bureau, icône de notification et deuxième lancement réaffichent Canapey. | À tester |
| Configuration absente / invalide | Sauvegarder le dossier de données de test, retirer config puis injecter JSON invalide ; défauts ou backup, original conservé. | Logique testée ; intégration à tester |
| Icônes / visuels | Import `.lnk` avec espaces/arguments, app Store ; modifier carte/fond avec dialogue, relancer, vérifier stockage local. | À tester |
| Détection bloquée | AppLocker/PowerShell bloqué ou timeout ; erreur courte, accueil encore utilisable, ajout `.exe` possible. | À tester |
| Hors ligne | Couper Internet avant lancement de l’app déjà installée avec WebView2 ; interface et applications locales fonctionnelles. | À tester |
| Arrêt / redémarrage / veille | Annuler d’abord chaque confirmation ; sur PC de test sans document ouvert, confirmer chaque action et vérifier la reprise. | À tester |
| Mise à jour indisponible | Endpoint indisponible ou machine hors ligne : pas de blocage, message manuel utile. | UI testée ; réseau natif à tester |
| Mise à jour signée | Publier deux versions signées, attendre la promotion du canal, vérifier signature, notes, installation et données conservées. Vérifier rejet d’une signature invalide. | Clés configurées ; parcours Windows à tester |

## Mesures de performance à recueillir

Les logs permettent de distinguer :

- `frontend_loaded_ms` : chargement Vue et configuration avant demande d’affichage.
- `startup_interactive_ms` : depuis l’entrée du runtime Rust jusqu’au signal après affichage et deux frames. Le launcher est montré **avant** la demande de frames, pour éviter la suspension de `requestAnimationFrame` d’une WebView masquée.
- `return_window_request_ms` : demande de remise au premier plan ; ce n’est pas encore une preuve de peinture.
- `return_interactive_ms` : retour jusqu’au signal frontend après deux frames.

Protocole conseillé : build Release, mêmes applications et visuels, même écran, pas de devtools. Relever CPU, RAM, SSD, version Windows, résolution/DPI et version WebView2. Noter séparément **5 premiers lancements après redémarrage du PC** (froid), **10 relancements après fermeture complète de Canapey** (chaud), et **10 retours depuis une application**. Une seconde instance qui réaffiche la première ne compte pas comme un démarrage chaud. Conserver les valeurs brutes, médiane et p95. Compléter par une mesure externe de création de processus à première interaction si le temps du chargeur Windows doit être inclus.

| Mesure sur PC cible | Valeur |
| --- | --- |
| Froid | Non mesuré |
| Chaud | Non mesuré |
| Retour | Non mesuré |

Objectif de premier accueil interactif : **moins de 1 seconde** sur un PC récent avec SSD. Aucun résultat n’est extrapolé à partir de Vite, de Chrome sur Mac ou du temps de compilation. Aucun chiffre de démarrage complet de Windows n’est annoncé.

## Livrables locaux

- `release/Canapey-Launcher-0.1.0-windows-x64-setup.exe` : installateur final (5654170 octets).
- `release/SHA256SUMS.txt` : empreinte vérifiée après copie.
- `docs/build-validation.json` : résultats, empreintes des sources et de l’installateur.
- Aucun dépôt Git ne préexistait dans ce dossier ; aucun commit, push ni publication n’a été effectué.

## Contrôle approfondi des commandes

Le contrôle clavier/manette du 16 octobre couvre 76 états de panneaux sur desktop et mobile. Tous les contrôles activables de ces états sont atteignables aux flèches. Parcours rejoués au clavier puis avec une fixture des événements IPC manette ; aucune exécution Windows ou manette physique n’est simulée comme réussie. Détails, commandes et limites : [CONTROLES.md](CONTROLES.md). Résultats structurés : [controls-validation.json](controls-validation.json).


## Clavier à l’écran et test manette — 17 octobre 2026

- Clavier AZERTY : saisie par événements manette, navigation vers toutes les touches et actions, accents, majuscules, symboles, effacement, remplacement d’une sélection, validation et annulation, recherche et renommage enregistré, restitution du focus et saisie physique.
- Test manette : rendu des boutons, axes, gâchettes et direction filtrée, libellés Xbox/PlayStation, déconnexion/reconnexion, absence d’action de navigation pendant la capture, sortie du test et persistance de la zone neutre.
- Parcours Chrome système isolé à 1440×900 et 390×844, sans erreurs JavaScript. Le script `scripts/qa-sofa-tools.js` utilise une fixture IPC : il ne prouve ni la lecture d’une manette physique ni le maintien réel de B / Rond sous Windows.
- Vérification sur une copie isolée des changements du commit : `npm run check` réussi (44 tests JavaScript et 13 tests Rust), format Rust conforme et compilation Clippy Windows sans avertissement.
- À compléter sur PC Windows : Xbox et PlayStation USB/Bluetooth, sticks au repos et aux extrêmes, valeurs des gâchettes selon pilote, sortie par maintien B / Rond, perte de focus, reconnexion, absence de navigation parasite après le test et interaction avec Steam Input.

Rejouer dans un navigateur de test dédié après `npm run dev` :

```sh
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 ~/.codex/skills/playwright/scripts/playwright_cli.sh -s=canapey-sofa open http://127.0.0.1:1420 --browser chrome --config .playwright/cli.config.json
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 ~/.codex/skills/playwright/scripts/playwright_cli.sh -s=canapey-sofa run-code "$(cat scripts/qa-sofa-tools.js)"
```
