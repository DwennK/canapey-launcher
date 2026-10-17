# Démarrage : optimisation et mesures

Comparatif du 17 octobre 2026, référence `fc77e57`. Aucun push ni publication ne fait partie de cette modification.

## Résultat vérifié localement

Deux builds de production, servis localement avec le même serveur HTTP, testés dans Chrome système 155.0.8059.79 sur Mac Apple M4 / 16 Gio. Viewport 1440×900, animations activées. Douze navigations par version et par scénario, ordre avant/après alterné, nouveau contexte isolé à chaque navigation : 48 mesures. Chrome et le système sont déjà lancés ; les caches du système ne sont pas purgés. Aucun profil personnel utilisé.

Médianes, depuis le début de navigation :

| Scénario / mesure | Avant | Après |
| --- | ---: | ---: |
| Bibliothèque vide : focus puis deux frames | 64,9 ms | 66,2 ms |
| Bibliothèque vide : premier écran stabilisé | 665,0 ms | 66,3 ms |
| 24 applications, dernière sélectionnée : focus puis deux frames | 62,7 ms | 66,2 ms |
| 24 applications, dernière sélectionnée : carte entièrement dans le viewport | 1 062,7 ms | 41,2 ms |
| 24 applications, dernière sélectionnée : premier écran stabilisé | 1 063,5 ms | 66,4 ms |
| JavaScript demandé au démarrage, décompressé | 149 663 octets | 142 776 octets |
| CSS demandé au démarrage, décompressé | 32 894 octets | 28 789 octets |

Le gain démontré concerne l’affichage stable : suppression du fondu d’entrée et du déplacement animé vers la sélection mémorisée. Le délai jusqu’aux premières frames ne présente pas de gain démontré ; les écarts observés sont de quelques millisecondes. Le JavaScript initial diminue de 4,6 % et le CSS initial de 12,5 %. Les modules différés sont toujours présents dans la distribution et se chargent à leur ouverture.

« Stabilisé » signifie : carte sélectionnée entièrement visible et focalisée, image de carte et fond attendu chargés, police chargée, aucune animation en cours sur le fond ou le titre. Ce contrôle DOM n’est pas une mesure du compositeur Windows. Les mesures brutes, médianes, p95 et empreintes des assets sont dans [startup-benchmark.json](startup-benchmark.json).

**Aucune durée native Windows, à froid ou à chaud, n’a été mesurée.** Le benchmark frontend ne comprend pas le chargeur Windows, WebView2 ni les appels système réels. Il ne permet donc pas d’annoncer que Canapey démarre en 66 ms sous Windows.

## Modifications

- Clavier virtuel, diagnostic de la manette et aide/test Xbox chargés à la demande. Le clavier conserve sa prise de focus à son montage.
- Image de la carte sélectionnée chargée immédiatement et prioritaire ; les autres restent différées.
- Première sélection positionnée sans défilement animé. Premier titre et fond affichés sans fondu ; les transitions de fond après navigation et les animations après changement de vue restent actives.
- Lecture audio initiale lancée après le signal des deux premières frames.
- Menu et icône de notification créés sur le thread principal après ce signal. Le watchdog les crée aussi après trois secondes si le signal manque, sans créer de doublon. Le délai de trois secondes n’est pas une attente imposée au démarrage normal.
- Vérification des images manquantes conservée avant le bootstrap, afin de préserver la récupération de configuration existante ; son coût est désormais mesuré.

## Mesures natives automatiques

Elles sont écrites dans les journaux existants à chaque lancement normal, sans activation ni test manuel. Accès par **Paramètres → Diagnostic → Ouvrir les logs**. Aucun envoi réseau n’est ajouté.

| Champ | Signification |
| --- | --- |
| `startup_begin` | Version, OS, architecture, profil debug/release, PID. `setup_enter_ms` : délai depuis l’entrée du runtime Rust jusqu’au début du setup Tauri. |
| `startup_config_ms` | Création du dossier de données, lecture/récupération de configuration et vérification du démarrage automatique. |
| `startup_artwork_check_ms` | Vérification des fichiers d’images ; nombre d’applications enregistré avec cette durée. |
| `startup_display_ms` | Choix de l’écran et application du mode de fenêtre. |
| `startup_setup_ms` | Durée du setup Tauri. `startup_setup_complete_ms` : cumul depuis l’entrée du runtime Rust. |
| `frontend_loaded_ms` | Cumul natif au moment de la demande d’affichage, après configuration, abonnements et focus frontend. |
| `startup_interactive_ms` | Cumul natif au signal frontend après affichage et deux callbacks `requestAnimationFrame`. Ce signal ne garantit pas le chargement complet des images ni la disponibilité matérielle de la manette. |
| `startup_frontend_timings` | JSON des marques `entry`, `mounted`, `bootstrapStart/End`, `subscribeStart/End`, `focused`, `painted`, en ms depuis l’origine de navigation de la WebView. Une étape non atteinte vaut `null`. |
| `startup_deferred_tray_ms` | Durée de création du menu/icône, hors chemin normal jusqu’au premier signal des frames. |
| `startup_show_watchdog_ms` | Présent uniquement si le secours doit afficher la fenêtre faute de signal de disponibilité dans les trois secondes suivant son lancement. |

Les marques frontend sont aussi consultables via `performance.getEntriesByType('mark')`, préfixe `canapey:`. `entry` est posé après évaluation des imports ; `mounted` après montage de Vue. Soustraire les bornes Start/End pour les durées d’IPC. Les horloges Rust et frontend ont des origines différentes : ne pas les soustraire entre elles. Les durées de phases imbriquées ne s’additionnent pas au total.

Les logs identifient le profil mais ne devinent pas si un démarrage est froid ou chaud. Le retour depuis une application conserve ses mesures `return_window_request_ms` et `return_interactive_ms`.

## Vérifications et reproduction

- `npm run check` sur les seuls changements de startup isolés depuis `fc77e57` : version cohérente, build production, 46 tests JavaScript/TypeScript et 18 tests Rust réussis. Après intégration du commit parallèle `ed355d2`, les 21 tests Rust et Clippy Windows passent également. Les assets frontend sont identiques à ceux mesurés.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check` et `cargo check --manifest-path src-tauri/Cargo.toml --locked` réussis.
- Compilation croisée Windows : `cargo xwin clippy --manifest-path src-tauri/Cargo.toml --locked --target x86_64-pc-windows-msvc --all-targets -- -D warnings` réussie avec LLVM Homebrew. Cela compile et analyse le code Windows et ses tests, sans les exécuter sous Windows.
- Parcours Playwright `qa-sofa-tools.js` et `qa-audio.js` sur le build production : desktop 1440×900 et mobile 390×844, clavier virtuel, champs, test manette et commandes audio avec fixtures IPC ; aucune erreur JavaScript. Contrôle supplémentaire de l’ordre `frontend_painted` puis `audio_state` et du contenu des mesures. Vérification de l’absence des trois modules secondaires au démarrage et du chargement Xbox à la demande. Inspection visuelle des captures et de l’accueil dans le navigateur intégré.
- Tests dédiés au handshake : la fenêtre doit être montrée avant de demander des frames (évite le blocage d’une WebView masquée), le signal final attend deux callbacks et le mode navigateur ne fait aucun appel natif.

Pour reproduire le comparatif, construire la référence et la version candidate dans deux dossiers distincts. Servir leurs répertoires de sortie à la racine de `http://127.0.0.1:4174/` et `http://127.0.0.1:4175/`, puis exécuter `scripts/benchmark-startup.js` avec `playwright-cli run-code` dans une session Chrome isolée utilisant `.playwright/cli.config.json`. Le script retourne les échantillons et les statistiques ; il ne lance ni ne modifie une application Windows réelle.
