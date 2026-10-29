# Télécommande iPhone / Apple TV Remote

État au **19 octobre 2026** : portage Rust expérimental pour v0.5.0, désactivé par défaut,
réservé à Windows. Interopérabilité automatisée avec pyatv vérifiée ; **la découverte
et le fonctionnement avec un vrai iPhone sur Windows restent à confirmer**.
Consulter la [release v0.5.0](https://github.com/DwennK/canapey-launcher/releases/tag/v0.5.0)
pour les fichiers distribués et les résultats de livraison.

## Utilisation

Dans **Paramètres → Manettes et télécommandes → Télécommande → iPhone**, activer le service puis choisir
**Associer un iPhone**. Ouvrir Apple TV Remote dans le centre de contrôle de l’iPhone,
sélectionner le PC et saisir le code affiché par Canapey. Les deux appareils doivent
être sur le même réseau local privé. Aucun Python, programme auxiliaire ou logiciel
iOS supplémentaire n’est distribué. Canapey doit rester ouvert.

Le nom initial est `Canapey — <COMPUTERNAME>`. « Nom et réseau » permet de le changer
et de choisir une carte réseau ; le mode automatique choisit une interface privée
IPv4 disponible. L’identifiant de carte reste stable après un changement DHCP.

| Entrée | Canapey au premier plan | Autre application |
| --- | --- | --- |
| Glissement | Une étape directionnelle | Flèche correspondante |
| Toucher central | Validation ; maintien pour les options d’une carte | Entrée |
| Retour | Retour dans l’interface | Échap |
| TV | Accueil | Ramener Canapey à l’accueil |
| Lecture/pause | Commande multimédia Windows | Identique |
| Volume | Volume Windows | Identique |

Le guidage « Mon iPhone ne trouve pas Canapey » explique le profil Privé, les VPN,
les réseaux invités et les autorisations pare-feu privées : TCP sur le port affiché
et mDNS UDP 5353. Il ne prétend pas vérifier les règles effectives du pare-feu et
n’ajoute aucune exception automatiquement.

## Provenance et suivi

| Source | Dernière référence examinée | Référence portée / utilisée |
| --- | --- | --- |
| [windows-apple-remote](https://github.com/aryakvn/windows-apple-remote) | [`c8a494dcb656c79248fd24d60a814b35aa051e54`](https://github.com/aryakvn/windows-apple-remote/tree/c8a494dcb656c79248fd24d60a814b35aa051e54), release 0.2.0 ; HEAD revérifié le 29/10/2026 | Sous-ensemble Companion de ce commit, adapté en Rust pour v0.5.0 ; pas de reprise intégrale |
| [pyatv](https://github.com/postlund/pyatv) | [`b277a4c8222ecdcbaab8a24e3e713ca44765adb4`](https://github.com/postlund/pyatv/tree/b277a4c8222ecdcbaab8a24e3e713ca44765adb4), HEAD revérifié le 29/10/2026 ; comparaison avec `v0.18.0` pour Companion, HAP/SRP, OPACK et ChaCha20 | Oracle d’interopérabilité `pyatv==0.18.0` ; conventions cryptographiques et sérialisation adaptées |
| [Documentation Companion](https://pyatv.dev/documentation/protocols/#companion-link) | Consultée le 19/10/2026 | Description du protocole ; aucun engagement de compatibilité Apple |

Les licences MIT et copyrights complets sont conservés dans
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md), également inclus comme ressource
de l’application. Le code Python de référence n’est pas embarqué.

### Correspondances et adaptations

| Référence Python | Code Rust | Décisions |
| --- | --- | --- |
| `server.py` : annonce et connexion Companion | `src-tauri/src/apple_remote/server.rs`, `session.rs` | Tokio, mDNS limité à l’adresse choisie, fermeture des connexions et limites explicites |
| `server_auth.py`, helpers HAP/SRP pyatv | `apple_remote/auth.rs` | SRP-3072/SHA-512, HKDF, Ed25519, X25519, ChaCha20-Poly1305 ; clés aléatoires propres à Canapey |
| `opack.py` et TLV8 pyatv | `apple_remote/codec.rs` | Références OPACK typées, chaînes/blobs vides exclus de la table, tailles et profondeur bornées |
| `chacha20.py` pyatv | `apple_remote/auth.rs::Cipher` | Nonce de flux sur 12 octets avec compteur dans les 8 premiers octets little-endian ; en-tête authentifié |
| Informations Apple TV, session et gestes de `server.py` | `apple_remote/session.rs` | Réponses `_systemInfo`, `_sessionStart`, `TVRCSessionStart`, `_interest`, `_hidC`, `_hidT`, `_touchStart` ; métadonnées de compatibilité conservées |
| Injection clavier/média Python | `apple_remote_desktop.rs`, `platform/windows.rs` | Actions existantes, origine `iphone`, destinataire Windows ciblé, TV vers Canapey |
| Persistance et réglages du programme source | `apple_remote/mod.rs`, `apple_remote_desktop/windows.rs` | Identité persistante DPAPI utilisateur, association volontaire, révocation et configuration Tauri |

Les preuves SRP Companion/HAP ne correspondent pas au `process_reply` par défaut de
la bibliothèque `srp`. L’exponentiation utilise cette bibliothèque ; M1/M2 suivent
les conventions vérifiées contre srptools/pyatv : padding 384 octets pour `u`, sel
conservé **avec ses zéros initiaux**, entiers minimaux aux emplacements attendus.
Le vecteur `fixtures/srp-leading-zero.json` utilise exclusivement des valeurs de test.

Repris : correctif des références OPACK après une chaîne vide, informations et
réponses attendues à l’ouverture de session, prise en compte du pavé tactile et
des messages HID à relâchement seul. Adapté : un glissement navigue d’une case ; le
bouton TV ramène Canapey. Écartés volontairement : mode souris, bascule souris par
TV, Siri, AirPlay, informations de lecture et réveil du PC. Les métadonnées Siri
héritées servent à la compatibilité de découverte, sans implémentation vocale.

### Veille et vérification avant release

Une veille Codex est active dans le chat d’implémentation, **le lundi à 09:00,
Europe/Zurich**, identifiant `veille-t-l-commande-iphone-canapey`.
Elle surveille commits, releases et signalements pertinents de windows-apple-remote,
ainsi que les changements Companion de pyatv. Elle signale seulement une amélioration
applicable, une régression, un correctif de sécurité ou un blocage, avec liens et
impact. Elle ne modifie pas Canapey et n’intègre rien automatiquement.

`AGENTS.md` impose également un examen avant chaque release. Pour chaque examen,
ajouter une ligne datée avec référence, changement, décision, justification et tests.
**Examiné** signifie que le changement a été évalué ; **intégré** exige un portage
effectif accompagné de tests. Ne jamais avancer la colonne intégrée sur la seule
base d’une nouvelle release amont. La référence pyatv ci-dessus est celle étudiée,
pas une affirmation que tous ses changements ultérieurs ont été examinés.

| Examen avant release | Références examinées | Décision et vérification |
| --- | --- | --- |
| 19/10/2026, préparation de v0.5.0 | windows-apple-remote `c8a494d` ; pyatv `b277a4c8222ecdcbaab8a24e3e713ca44765adb4` comparé à `v0.18.0` | HEAD windows-apple-remote inchangé, aucun signalement ouvert au moment de l’examen ; aucun changement Companion/OPACK/HAP-SRP/ChaCha20/TLV8 dans la comparaison pyatv. Aucun correctif supplémentaire à reprendre ; références intégrées inchangées. Oracle pyatv et contrôles de release relancés. |
| 29/10/2026, préparation de v0.6.0 | windows-apple-remote `c8a494dcb656c79248fd24d60a814b35aa051e54`, dernière release `v0.2.0` ; pyatv `b277a4c8222ecdcbaab8a24e3e713ca44765adb4` | Les deux HEAD sont inchangés depuis le 19/10 ; aucun signalement ouvert windows-apple-remote. La comparaison pyatv avec `v0.18.0` ne touche que `CHANGES.md` et `pyatv/const.py`, aucun fichier Companion/cryptographie. Aucun nouveau correctif retenu ou écarté ; références effectivement portées inchangées. Tests Rust locaux et oracle Companion en CI requis pour cette release. |

## Architecture et limites de protection

- `apple_remote` n’utilise pas Tauri ; `--no-default-features` suffit pour ses tests.
  La couche desktop se charge de Windows, des réglages et de l’acheminement des actions.
- Le démarrage réseau a lieu après `frontend_painted`. Désactivé, le superviseur
  n’énumère pas les interfaces et n’ouvre pas de socket. L’identité est chargée à
  la première activation. Pas de programme auxiliaire ni de processus Python.
- Association ouverte explicitement pendant 120 secondes, PIN aléatoire à quatre
  chiffres, cinq débuts de tentative maximum par ouverture. Annulation, expiration,
  changement réseau et réussite ferment l’accès ; un nouveau code invalide les
  anciennes négociations. Aucune commande avant vérification cryptographique.
- Identité et huit appareils maximum dans `apple-remote/identity.dpapi`, sous le
  dossier de données Tauri, distinct du JSON des réglages. Chiffrement DPAPI lié à
  l’utilisateur Windows, écriture temporaire synchronisée puis remplacement atomique.
  Un fichier corrompu provoque une erreur, sans remplacement silencieux.
- Une dissociation est persistée avant de retirer l’autorisation. Les sessions
  concernées sont interrompues par signal ; les actions en file sont réautorisées
  à leur traitement. Une déconnexion annule la validation en cours et relâche les
  touches externes vers leur destinataire initial, même après changement de focus.
- Navigation externe par messages de fenêtre ciblés, pas par `SendInput` : elle ne
  repasse pas dans les raccourcis globaux Flirc. Les transitions appui/relâchement
  sont conservées ; aucune répétition automatique supplémentaire n’est créée.
- Quatre connexions simultanées, négociation 30 s, inactivité 600 s, lecture des
  fragments et écriture bornées à 5 s, 256 trames/s/connexion, trame 64 Kio,
  profondeur OPACK 24, 4 096 nœuds et budget de contenu décodé 256 Kio. File native
  de 64 actions, annulation des appuis en cas de saturation.
- Le service écoute une seule adresse IPv4 d’un réseau classé **Privé** par Windows.
  Public et Domaine sont exclus. Les réseaux sont revérifiés toutes les 3 secondes :
  il existe donc un délai de détection lors d’un changement de profil. L’arrêt et
  la reprise après changement d’adresse sont supervisés ; aucun port public n’est
  ouvert automatiquement. Une politique pare-feu limitée au profil Privé complète
  cette sélection, notamment pendant ce délai.
- Les PIN et clés ne sont pas journalisés. Le PIN temporaire est transmis au frontend
  pour affichage. Le programme de test loopback affiche son propre PIN éphémère de
  test pour l’oracle Python ; il n’est pas livré dans l’installateur.

Limites fonctionnelles : IPv4 uniquement ; pas de diagnostic automatique complet
du pare-feu ; pas de nom convivial fourni par l’iPhone, donc liste par identifiant ;
volume relatif avec valeur de protocole approximative, sans retour du volume réel.
Les applications qui ignorent les messages clavier et les fenêtres élevées peuvent
refuser la navigation. La compatibilité des métadonnées avec chaque version iOS et
la reprise après veille nécessitent des essais physiques.

## Validation reproductible

```sh
npm run check
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo build --manifest-path src-tauri/Cargo.toml --locked --no-default-features --example companion_probe
python3 -m venv /tmp/canapey-companion-tests
/tmp/canapey-companion-tests/bin/pip install -r scripts/apple-remote-test-requirements.txt
/tmp/canapey-companion-tests/bin/python scripts/test-apple-remote.py
```

Python est exclusivement un outil de développement isolé. Le test utilise
`127.0.0.1`, sans annonce mDNS ni identité utilisateur persistée. Il couvre mauvais
PIN, association correcte, vérification et commandes chiffrées, reconnexion,
révocation d’une session active, refus après révocation, commande non authentifiée
et trame trop grande. Un avertissement pyatv concernant l’ancienne API HID volume
est attendu ; l’API audio avec retour absolu n’est pas prise en charge.

Le job CI `companion-interop` exécute le même oracle sous Linux. Le job Windows
existant exécute les tests natifs, dont DPAPI et les messages clavier ciblés.
Les résultats de livraison sont consultables dans [GitHub Actions](https://github.com/DwennK/canapey-launcher/actions).
Le bilan ci-dessous décrit les contrôles locaux effectués avant cette livraison.

Vérifications locales du 19/10/2026 :

- `npm run check` : construction frontend, versions cohérentes, **70 tests JS et
  47 tests Rust réussis**.
- Rustfmt et Clippy Windows x64, tous les targets, avec `cargo xwin clippy` et
  `-D warnings`. C’est une vérification de compilation/analyse, pas une exécution Windows.
- Oracle pyatv 0.18.0 : réussite des scénarios ci-dessus.
- Chrome système isolé, Playwright : `scripts/qa-apple-remote.js`, 1440 × 900 et
  390 × 844 ; activation, sauvegarde/échec, PIN avec zéro initial, annulation,
  expiration simulée, révocation, erreur réseau, libération/doublons/connexion
  distincte des appuis. Zéro erreur JavaScript. IPC Tauri simulé.
- Régression `scripts/qa-remote.js` : onze associations Flirc, fonctionnement des
  écrans et interactions existants, réussite. Inspection visuelle complémentaire
  dans le navigateur intégré ; disponibilité Windows correctement signalée.
- `scripts/benchmark-apple-remote.js`, build Vite de production sur le port 4178 :
  huit chargements alternés par état, contextes Chrome neufs. Médiane jusqu’au signal
  de premier affichage : **54,85 ms désactivé / 56,25 ms activé**. Le composant de
  réglages iPhone n’est pas chargé au démarrage. Mesure du renderer avec IPC simulé,
  sans démontrer le coût de Tauri, du réseau ou de DPAPI sur Windows.

Les scripts QA sont des fonctions à exécuter avec `playwright-cli run-code` dans une
session Chrome dédiée, sur le serveur Vite. Ils ne nécessitent aucun profil personnel.

## Validation matérielle restant à faire

Ne pas annoncer la compatibilité matérielle avant de renseigner ce tableau.

| Essai Windows + iPhone | Résultat / versions |
| --- | --- |
| Version Windows, modèle/version iOS, carte réseau | Non testé |
| Découverte mDNS, nom personnalisé, mauvais PIN puis bon PIN | Non testé |
| Chaque geste/bouton, appui long, absence de double validation | Non testé |
| Flèches/Entrée/Échap dans navigateur, lecteur vidéo et jeu ; Flirc actif | Non testé |
| TV ramène Canapey ; simple glissement ne le ramène pas | Non testé |
| Lecture/pause et volume Windows | Non testé |
| Redémarrage Canapey/PC, identité et associations conservées | Non testé |
| Dissociation pendant appui, coupure réseau, activation/désactivation | Non testé |
| Passage Privé → Public, changement Wi-Fi/DHCP, veille/reprise | Non testé |
| Pare-feu privé autorisé/bloqué, VPN, réseau invité | Non testé |
| Démarrage installé activé/désactivé : mêmes conditions, plusieurs mesures | Non testé |

Pour le dernier essai, comparer les métriques de démarrage existantes et
`apple_remote_bind_ms` dans les journaux. Cette dernière mesure le bind/annonce après
le premier affichage, pas la durée totale de démarrage. Ne jamais joindre de PIN,
clés ou fichier d’identité à un rapport.
