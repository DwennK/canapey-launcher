# Canapey Launcher

Un launcher de salon pour **Windows 11 x64**, développé avec **Tauri 2, Rust, Vue 3 et TypeScript**. Explorer reste actif. Aucun compte, serveur ou service distant n’est requis pour l’usage quotidien.

L’accueil et les paramètres se pilotent au clavier, à la souris et à la manette. Toutes les images et la police sont embarquées. Les cartes proposées au premier démarrage sont étiquetées **À ajouter** : elles ne représentent pas des logiciels détectés.

**Version actuelle : 0.1.0 — prérelease de test.** [Télécharger l’installateur Windows](https://github.com/DwennK/canapey-launcher/releases/tag/v0.1.0) · [Toutes les releases](https://github.com/DwennK/canapey-launcher/releases) · [Notes de version](CHANGELOG.md).

Les versions `0.x` restent expérimentales. L’installateur n’est pas signé Authenticode ; Windows peut afficher un avertissement SmartScreen. Les essais interactifs sur Windows et manettes physiques restent à effectuer.

## Démarrer

Prérequis Windows : Node.js 24 LTS (ou 22.12+), Rust stable 1.90+, Visual Studio Build Tools avec « Développement Desktop en C++ », Windows SDK et WebView2. Windows 10, x86 et ARM64 ne sont pas pris en charge.

```powershell
npm ci
npm run desktop
```

Lancer uniquement l’interface dans un navigateur, notamment sur macOS :

```sh
npm ci
npm run dev
```

Ouvrir http://127.0.0.1:1420. Ce mode est explicitement indiqué **Aperçu interface**. Il utilise un stockage navigateur isolé, autorise l’édition de raccourcis web, et **ne simule pas** un lancement Windows, une détection, une manette Rust ni une mise à jour réussie. Ne pas utiliser ces essais pour conclure sur les fonctions natives.

## Compiler l’installateur Windows

Sur Windows 11 x64 :

```powershell
npm run tauri -- build --target x86_64-pc-windows-msvc --bundles nsis
```

Résultat : `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`. Installation par utilisateur, sans modifier le shell Windows. WebView2 est généralement présent sous Windows 11 ; le bootstrapper embarqué nécessite Internet uniquement s’il manque. **Après installation, l’accueil fonctionne hors ligne.**

Compilation croisée de secours depuis macOS, avec `cargo-xwin`, LLVM et NSIS :

```sh
PATH="/opt/homebrew/opt/llvm/bin:$PATH" npm run tauri -- build --runner cargo-xwin --target x86_64-pc-windows-msvc --bundles nsis
```

Un installateur compilé n’est pas une preuve d’exécution sur un PC Windows. La CI `.github/workflows/ci.yml` compile également l’installateur et le conserve en artefact de test.

## Utilisation

| Commande | Action |
| --- | --- |
| Flèches / D-pad / stick gauche | Déplacer la sélection |
| Entrée / A / Croix | Choisir, ouvrir, reprendre |
| Bas depuis l’accueil | Ouvrir la grille |
| Haut depuis la première ligne | Revenir au carrousel |
| Escape / B / Rond | Retour, annuler |
| F1 / Start / Options (relâchement) | Paramètres |
| Start + Back maintenus 1,2 s | Retour global, sans fermer l’application |
| Ctrl + Maj + Q | Confirmation pour quitter Canapey |
| Alt + F4 | Fermer Canapey, sortie Windows de secours |

La combinaison globale peut être désactivée ou remplacée par **LB + RB + Start**, et sa durée est réglable. La combinaison alternative utilise les boutons d’épaule L1/R1 sur PlayStation. Les autres entrées manette sont ignorées quand Canapey n’est pas au premier plan. Le retour global exige un relâchement avant de reprendre la navigation.

**Steam Input** peut intercepter Start/Back et la configuration Bureau peut convertir la manette en clavier/souris. Désactiver cette configuration pour Canapey ou choisir l’autre combinaison. La double conversion Steam Input + entrée native n’est pas automatiquement désactivée par Canapey. Les manettes doivent être exposées à Windows dans un format reconnu par gilrs/Windows Gaming Input ; aucun pilote PlayStation n’est installé par le launcher.

Les paramètres, l’import multiple, l’ordre, le choix d’ambiance, les confirmations et l’alimentation sont navigables à la manette. La saisie d’un chemin/URI ou le choix initial de fichiers peut nécessiter le clavier et les dialogues Windows.

## Détection et lancement

La détection est déclenchée uniquement par l’utilisateur, après l’affichage de l’accueil. Elle examine les menus Démarrer utilisateur/commun, les bureaux utilisateur/commun, les clés **App Paths** et les identités packagées retournées par **Get-StartApps**. Elle ne parcourt jamais tous les disques.

Un script PowerShell fixe utilise WScript.Shell pour résoudre les `.lnk` et conserver leurs arguments/dossiers de travail. Les arguments sont décomposés avec `CommandLineToArgvW`. Les exécutables sont lancés avec `std::process::Command` et une liste d’arguments. Les raccourcis non résolus et les URI passent par `ShellExecuteExW`, les identités Store par `IApplicationActivationManager`. Aucun chemin utilisateur n’est concaténé dans un script ou une commande de shell. AppLocker ou une politique PowerShell restrictive peut bloquer la détection ; l’ajout manuel d’un `.exe` reste disponible. La recherche est bornée à 600 raccourcis par racine, 1 500 résultats et 60 secondes.

Les raccourcis web sont ajoutés explicitement et marqués **WEB**. Protocoles autorisés : `http`, `https`, `steam`, `spotify`, `ms-xbox`. Les chemins UNC, scripts `.bat/.cmd`, arguments supplémentaires pour URI et identités packagées sont refusés. Ces limites sont volontaires dans cette version.

Les raccourcis prêts à ajouter sont **YouTube**, **Netflix**, **Spotify** (`https://open.spotify.com/`) et **Internet** (`https://www.google.com/`). Ils s’ouvrent dans le navigateur Windows par défaut. Pour changer la page de départ d’Internet, modifier sa **Cible** dans Paramètres → Applications. Spotify installé peut aussi être importé depuis la détection Windows ; son ambiance musicale est attribuée automatiquement. Les deux nouvelles ambiances sont embarquées et disponibles dans l’éditeur de carte.

Le suivi associe les fenêtres à des identités **PID + date de création**, suit les descendants et reconnaît une instance existante par le chemin exact d’un exécutable non navigateur. Une disparition de la dernière fenêtre déclenche le retour après une courte temporisation ; la fin du seul premier PID n’est pas interprétée comme la fermeture. Une application restée sans fenêtre après 20 s est signalée non suivie, ou retirée si aucun processus pertinent ne subsiste. Pas de destruction par nom de processus.

La fermeture normale utilise `WM_CLOSE`. Après 5 s, l’interface peut proposer explicitement une fermeture forcée, limitée aux processus démarrés par Canapey et à leurs descendants identifiés. Une instance déjà présente n’est pas tuée de force. Les applications suivies restent accessibles dans **Diagnostic**, même si leur carte a été retirée.

### Limites de suivi à connaître

- Les URI et navigateurs partagent souvent des processus/fenêtres. Leur lancement est réel, mais Canapey les indique **non identifiables** : reprise via Alt+Tab, retour via le raccourci global, aucune fermeture forcée. « Ne plus suivre » enlève seulement le suivi, sans fermer le navigateur.
- Une chaîne de lanceurs très rapides dont un processus intermédiaire disparaît avant le prochain instantané, une activation via un service non apparenté ou une fenêtre hébergée dans un processus système peut échapper à l’association. Aucun PID arbitraire n’est adopté pour compenser. Les applications Store, Steam et logiciels mono-instance doivent être validés sur les versions réellement installées.
- Les applications élevées, protégées, sans fenêtre ou certains jeux en plein écran exclusif peuvent refuser l’inspection/la fermeture/le focus. Windows garde le dernier mot. En cas de refus de focus, Canapey fait clignoter son bouton dans la barre des tâches.
- Une application lancée hors Canapey est reconnue à l’activation de sa carte, pas par un scan initial bloquant.

## Données, images et logs

Répertoire de données Windows : `%APPDATA%\com.canapey.launcher\`.

- `config.json` : applications, ordre, sélection et paramètres ; validation à chaque écriture.
- `config.backup.json` : version valide précédente. Écriture temporaire dans le même dossier, synchronisation et remplacement atomique.
- `config.invalid-<timestamp>.json` : original invalide conservé avant récupération.
- `art/` : images personnalisées importées, converties en WebP ; cartes 640×360, fonds 1920×1080. Source limitée à 20 Mo / 8192 px. Quota 128 Mo.
- `icons/` : cache d’icônes extraites, limité à 64 Mo.

Les logs rotatifs sont accessibles dans **Paramètres → Diagnostic → Ouvrir les logs**. Ils contiennent erreurs natives et mesures de temps ; aucun secret de mise à jour. Ne pas supprimer les fichiers personnels d’`art/` encore référencés. Retirer une carte ne désinstalle jamais le logiciel et ne supprime pas les images personnalisées.

Démarrage avec Windows : plugin officiel autostart, à l’ouverture de la session utilisateur. Une seconde instance réaffiche la première. L’icône de notification permet d’ouvrir ou quitter Canapey. **Retour Windows** affiche le bureau avec le shell Windows ; le launcher reste disponible. Le moniteur préféré est conservé et l’écran principal sert de repli si la TV est déconnectée. La topologie des écrans est revérifiée périodiquement, y compris après veille. Aucune modification de Winlogon/Explorer.

## Mises à jour GitHub Releases

Le code utilise le plugin officiel Tauri Updater : vérification différée de 15 s, vérification manuelle, version et notes, installation à la demande, vérification de signature et préservation du répertoire de données. Aucun téléchargement ni redémarrage automatique sans action utilisateur. Toute installation est bloquée tant qu’une session est suivie ou qu’un lancement est en cours. Les erreurs réseau ne bloquent pas l’accueil.

Le dépôt public est [DwennK/canapey-launcher](https://github.com/DwennK/canapey-launcher). Les mises à jour intégrées restent **désactivées explicitement** dans la configuration de développement et les préreleases `0.x`. Ces installateurs se téléchargent depuis la page Releases. Le canal signé ci-dessous est réservé aux futures releases stables : l’endpoint GitHub `latest` ne distribue pas les préreleases.

### Versions et publication expérimentale

L’agent choisit le prochain numéro selon les changements, conformément à [AGENTS.md](AGENTS.md) : correctifs et petites améliorations en `0.1.1`, `0.1.2`, etc. ; fonctionnalités importantes en `0.2.0`, `0.3.0`, etc. Le passage en `1.0.0` nécessite une décision explicite de l’utilisateur.

```sh
npm run version:bump -- patch  # ou minor
npm run version:check
npm run check
```

La commande synchronise `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` et `src-tauri/Cargo.lock`. Elle ne crée ni commit ni tag. Les deux workflows vérifient les versions ; celui de release vérifie aussi le tag. Après mise à jour de `CHANGELOG.md`, commit et push autorisés, pousser le tag annoté `vX.Y.Z` : GitHub Actions compile l’installateur Windows et prépare un brouillon de prérelease avec une empreinte SHA-256. L’agent vérifie les résultats, complète les notes et publie le brouillon dans le cadre de la livraison demandée.

### Futur canal stable signé

1. Utiliser le dépôt public existant et décider explicitement du passage en version stable.
2. Générer une paire avec `npm run tauri -- signer generate -w <chemin-hors-du-depot>`. Le fichier privé est provisoire : après import et validation dans les secrets Actions, retirer sa copie locale. Ne jamais le committer ni l’incorporer dans l’application.
3. Ajouter le contenu complet de la clé privée dans le secret Actions `TAURI_SIGNING_PRIVATE_KEY` et son mot de passe dans `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (chaîne vide si aucun).
4. Ajouter le contenu **base64 complet** du fichier `.pub` dans la variable Actions `TAURI_UPDATER_PUBLIC_KEY`.
5. Aligner les versions de `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, et les lockfiles. Créer le tag `vX.Y.Z`.
6. Le workflow `release.yml` utilise automatiquement `GITHUB_REPOSITORY` et génère `tauri.release.conf.json` avec la clé publique et `https://github.com/OWNER/REPO/releases/latest/download/latest.json`. La clé publique est alors incorporée dans l’application compilée.
7. Le workflow compile Windows x64, signe les artefacts de mise à jour et crée une **release brouillon** avec l’installateur, sa signature et `latest.json`. Vérifier sur un vrai PC, rédiger les notes, puis publier le brouillon. Un brouillon n’est pas une mise à jour distribuée.

Secrets disponibles seulement dans Actions, jamais dans le frontend. `GITHUB_TOKEN` est fourni par GitHub. Le fichier de configuration de release généré est ignoré par Git. La signature **Tauri Updater** est distincte de la signature **Authenticode Windows** : sans certificat Authenticode configuré, SmartScreen peut avertir pour l’installateur. Le workflow ne prétend pas posséder ce certificat.

## Validation et performance

```sh
npm run check
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

Sur Windows, exécuter aussi les tests avec les fonctions desktop activées :

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --locked --target x86_64-pc-windows-msvc
```

Le protocole et les preuves disponibles sont dans [docs/VALIDATION.md](docs/VALIDATION.md). Le budget de moins d’une seconde est **un objectif**, pas un résultat annoncé. `startup_interactive_ms` mesure depuis l’entrée du runtime Rust jusqu’au signal frontend après deux images rendues ; `return_interactive_ms` mesure le retour jusqu’au même signal. Les mesures démarrage à froid, à chaud et retour doivent être recueillies séparément sur le PC cible. Rien ne mesure ni ne promet le temps complet de démarrage de Windows.

## Organisation

- `src/App.vue`, `src/components/`, `src/lib/` : interface, focus spatial, navigation, pont IPC sans moteur de carrousel.
- `src-tauri/src/model.rs`, `config.rs`, `input.rs`, `tracking.rs` : logique pure testable sans bureau.
- `src-tauri/src/runtime.rs` : commandes validées, sessions, écran, instance unique, logs, mises à jour.
- `src-tauri/src/platform/windows.rs`, `discover.ps1` : intégration Windows ; séparation pour une future stratégie de shell, sans remplacement dans cette version.
- `public/art/` : visuels embarqués et miniatures, environ 1,6 Mo au total.
- `docs/artwork-prompts.json` : prompts exacts des six compositions, générées avec l’outil intégré ImageGen. Les noms de services sont des traitements typographiques, pas des logos officiels revendiqués. La carte Windows est une composition vectorielle locale. Les marques appartiennent à leurs titulaires ; aucune affiliation.
- `public/fonts/` : Manrope, licence SIL OFL jointe.

## Références officielles

- [Tauri Updater](https://v2.tauri.app/plugin/updater/)
- [Tauri GitHub Actions](https://v2.tauri.app/distribute/pipelines/github/)
- [Tauri Windows Installer et compilation croisée](https://v2.tauri.app/distribute/windows-installer/)
- [Tauri Single Instance](https://v2.tauri.app/plugin/single-instance/) et [Autostart](https://v2.tauri.app/plugin/autostart/)
- [gilrs](https://docs.rs/gilrs/latest/gilrs/)
- [Microsoft : lancement ShellExecute](https://learn.microsoft.com/en-us/windows/win32/shell/launch) et [SetForegroundWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setforegroundwindow)
