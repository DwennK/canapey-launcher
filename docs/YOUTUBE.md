# YouTube dans Canapey

## Parcours

La carte **YouTube** apparaît sur l’accueil et dans la bibliothèque même si l’application n’est pas installée. Elle respecte la recherche et le filtre Vidéo. Les libellés restent « YouTube », « Installer YouTube » et « Ouvrir YouTube ».

À l’ouverture, Canapey vérifie les installations existantes. Si une installation est trouvée, sa carte est enregistrée puis ouverte en plein écran. Sinon, la fiche affiche la version stable disponible et sa taille. Le bouton Installer télécharge l’installeur puis ouvre l’assistant Windows standard ; une fois celui-ci terminé, Canapey recherche à nouveau l’application et enregistre la carte. Le bouton Ouvrir devient disponible après détection effective.

Les installations déjà enregistrées conservent leur identifiant, leurs favoris, leur catégorie et leurs visuels personnalisés. Un déplacement de l’exécutable est réparé lorsqu’une nouvelle installation est détectée. Les raccourcis Web existants sont conservés séparément avec leur badge Web. Une installation portable placée dans un dossier arbitraire doit être ajoutée manuellement ou disposer d’un raccourci reconnu.

## Implémentation

- Application utilisée : [shy1132/VacuumTube](https://github.com/shy1132/VacuumTube).
- Résolution au moment de l’installation via l’API GitHub `releases/latest`, sans version figée. Les brouillons et préreleases sont refusés.
- Seul `VacuumTube-Setup.exe` provenant du dépôt et du tag attendus est accepté. HTTPS et redirections GitHub autorisées uniquement ; taille plafonnée à 512 Mio, taille exacte et empreinte SHA-256 fournies par GitHub vérifiées avant exécution. Cette vérification ne remplace pas une signature Authenticode.
- Téléchargement en flux dans un dossier temporaire dédié, nettoyé après achèvement, erreur ou annulation normale. Le téléchargement peut être annulé même si le serveur ne répond plus. Une seule installation peut être active à la fois.
- L’assistant est interactif : pas d’installation silencieuse ni d’élévation forcée par Canapey. La fiche reste ouverte pendant l’opération ; une annulation dans l’assistant ne crée aucune carte si l’exécutable est absent.
- Détection par les chemins déjà enregistrés, LocalAppData/Programs, Program Files, le registre de désinstallation utilisateur/machine et les raccourcis du menu Démarrer/Bureau. Script PowerShell fixe, sans interpolation de commandes, avec délai maximal de 20 secondes.
- L’ajout passe par la sauvegarde habituelle de configuration. Un échec d’enregistrement laisse l’installation réutilisable avec Ouvrir, sans la télécharger de nouveau.
- Le navigateur de prévisualisation présente la fiche mais désactive l’installation. Cette fonctionnalité est destinée à Windows.

## Validation locale — 29 octobre 2026

- Build Vue/TypeScript et 86 tests frontend réussis, dont 5 tests de catalogue et d’enregistrement YouTube.
- 51 tests Rust réussis, dont validation des métadonnées, refus de fichiers altérés/tronqués/surdimensionnés et annulation d’une requête bloquée.
- Test réseau explicite avec le client réellement utilisé : GitHub retourne `v2.0.1`, `238708670` octets, SHA-256 `25f8f5e631175392e5d721fcedda7c1b49775e59d25453d4e99ab468bfa02875`. Ce test est ignoré par défaut pour garder la suite hors ligne ; exécution manuelle : `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features vacuumtube::tests::live_latest_stable_release -- --ignored --nocapture`.
- Vérification croisée Windows x64 avec `cargo xwin clippy --target x86_64-pc-windows-msvc -- -D warnings` ; format Rust et versions synchronisées.
- Chrome système isolé, desktop 1440×900 et mobile 390×844 : fiche, visuel, recherche/filtres, progression, annulation, erreur réseau, fermeture de l’assistant, échec de sauvegarde puis reprise, installation préexistante, réparation d’un chemin déplacé, absence de doublon natif et de faute JavaScript. Les réponses Windows sont simulées pour ces parcours. Captures et script local dans `output/playwright/youtube/`.

L’installeur Windows, la détection réelle dans le registre/raccourcis, le lancement de l’application et les contrôles sur TV restent à essayer sur un PC Windows. La compilation croisée et les simulations ne valident pas ces interactions physiques. Aucune nouvelle release n’est publiée par cette modification.
