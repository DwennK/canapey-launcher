# Notes de version

## 0.6.0 — 2026-10-29

### Télécommande

- OK valide dans l’application active : Entrée à l’extérieur, validation et appui long dans Canapey. Les flèches et Retour ciblent aussi l’application active. Seule l’action Accueil rappelle Canapey ; les panneaux du launcher ne volent plus le focus.
- Un appui OK conserve son destinataire jusqu’au relâchement ; les répétitions ne créent pas de double validation. Une perte de focus annule la validation commencée dans Canapey.
- Les associations existantes sont conservées. Les applications ignorant les messages clavier Windows et les fenêtres administrateur peuvent refuser les commandes ; essais matériels sur HTPC à effectuer.

### YouTube

- Carte YouTube proposée même sans installation, avec le visuel intégré et les actions Installer / Ouvrir.
- Détection et réutilisation de VacuumTube ; installation de sa dernière release stable GitHub, avec progression, annulation et vérification SHA-256 avant ouverture de l’assistant Windows.
- Enregistrement sans doublon natif, réparation d’un chemin déplacé et conservation des préférences. Les raccourcis Web existants restent disponibles.
- Validation et limites Windows documentées dans `docs/YOUTUBE.md`.

### Bibliothèque

- Chargement immédiat des premières rangées de cartes ; récupération automatique par les visuels intégrés si une image personnalisée ou de thème ne peut pas être décodée. Un changement de visuel réinitialise les erreurs de la carte.
- Restauration de la dernière carte retirée, avec sa position, son favori et sa catégorie, depuis la bibliothèque ou les paramètres. Disponible pendant la session jusqu’à fermeture du message ou au retrait suivant.
- Compteurs par filtre, nombre de résultats sur le total, effacement de la recherche sans perdre la catégorie et aide adaptée aux favoris vides.
- Déplacer une carte active le tri « Mon ordre » pour rendre le changement visible.
- Oracle de test Companion : dépendance SRP compatible figée pour rétablir l’interopérabilité pyatv en CI.

### Interface et configuration

- Accueil centré sur les applications en cours et les favoris, accès explicite à la bibliothèque et actions Ouvrir / Reprendre.
- Bibliothèque avec recherche insensible aux accents, filtres Tout / Favoris / Jeux / Vidéo / Musique / Autres, tri et catégories modifiables.
- Paramètres regroupés en cinq sections, dernière rubrique mémorisée, retour d’enregistrement et erreurs visibles. Test manette intégré ; dépannage Xbox / Steam Input repliable.
- Guide des dix boutons essentiels de la télécommande, reprise des étapes incomplètes et résumé des associations. Les conflits et protections de capture existants sont conservés.
- Détection des applications dès la première ouverture de l’ajout, recherche focalisée et bouton indiquant le nombre d’applications à ajouter.
- Textes, contrôles et aides agrandis ; navigation mobile visible ; retour Windows déplacé dans les commandes système. Focus préservé entre sous-pages et clavier virtuel utilisable dans la bibliothèque.
- Préférences enregistrées dans la configuration native avec migration rétrocompatible ; validation locale détaillée dans `docs/UX_SPRINT.md`.

## 0.5.0 — 2026-10-19

- Télécommande iPhone expérimentale, native en Rust : association par PIN, navigation dans Canapey et les applications Windows, retour à l’accueil et commandes multimédias. Désactivée par défaut, limitée aux réseaux privés IPv4 ; compatibilité sur iPhone réel à confirmer.
- Paramètres dédiés, appareils révocables et identité protégée par Windows DPAPI.
- Tests d’interopérabilité Companion avec pyatv et suivi documenté des projets d’origine avant chaque release.

## 0.4.0 — 2026-10-17

- Nouvel onglet Ambiance séparé des Manettes : ambiances générales Salon, Émeraude, Nuit et Crépuscule, fond fixe ou lié à l’application, luminosité, flou, animations et volume des sons.
- Fonds et cartes harmonisés autour de la direction visuelle Spotify, conservée ; Silo dispose d’un univers streaming.
- Paramètres et menus de carte redessinés, avec une meilleure lisibilité, des actions mieux regroupées et un positionnement qui garde le menu à l’écran.
- Correction du double focus entre une carte et les paramètres ; le logo Canapey ne reçoit plus le focus.
- La fermeture d’une application depuis Diagnostic conserve le menu et replace le focus sur un contrôle disponible.
- Volume actuel visible en haut, bouton d’alimentation en haut à droite et retrait de la veille des commandes rapides.
- Indicateur clavier/manette déplacé avant les aides en bas à gauche. Touches adaptées aux manettes Xbox, PlayStation et Nintendo reconnues, y compris dans les menus et le diagnostic.
- Nouveau symbole Canapey, favicon et icônes Windows assorties ; texte « canapey. » conservé et légèrement agrandi.
- Notes de version mises en forme et défilables à la manette. Après confirmation d’une mise à jour, Canapey demande la fermeture normale des applications suivies et attend leur arrêt ; aucune fermeture forcée ni fermeture d’une fenêtre partagée.
- Version expérimentale Windows 11 x64. Les essais interactifs avec de vraies manettes et applications Windows restent à effectuer ; un pilote qui présente une manette comme Xbox peut masquer sa marque réelle.

## 0.3.3 — 2026-10-17

- Télécommande : ajout des actions « Vue des tâches (Windows + Tab) », « Fermer la fenêtre active » et « Échap (Escape) » dans la catégorie Windows. Ces actions peuvent cibler la fenêtre active sans ramener Canapey au premier plan ; la fermeture reste normale, sans arrêt forcé du processus.
- Les menus de session et de carte se ferment après une demande de fermeture normale réussie ; ils restent ouverts en cas d’erreur.
- Suppression du bouton « Tout voir » sur l’accueil, l’accès Bibliothèque étant déjà présent.
- Nouvelle icône de mise à jour, plus simple et lisible.
- Les essais interactifs des nouvelles actions avec une télécommande physique sous Windows restent à effectuer.

## 0.3.2 — 2026-10-17

- Télécommande : toutes les actions sont disponibles globalement, avec apprentissage des touches ordinaires, de navigation, du pavé numérique et multimédias, indépendamment du récepteur. Les actions d’interface ramènent Canapey au premier plan ; les anciennes associations locales restent modifiables.
- Réservations Windows avec conflits explicites et indication de leur effet sur le clavier physique. Commandes multimédias sans réinjection de touches pour éviter les boucles ; doublons des alias Windows détectés.

## 0.3.0 — 2026-10-17

- Option pour quitter Canapey depuis le menu d’alimentation, avec confirmation et conservation des applications ouvertes.
- Dernière application sélectionnée conservée au redémarrage.

- Configuration visuelle de la Skip 1s / Flirc : photo complète cliquable, apprentissage et association de 34 commandes à la navigation, Home, applications, volume et lecture. Associations indépendantes, mode couleurs et portée locale/globale ; migration de l’ancien bouton Home. Les conflits conservent les réglages précédents. Validation matérielle Skip 1s / Windows encore à effectuer.

- Applications suivies maximisées à l’apparition de leur fenêtre principale et à la reprise depuis Canapey, avec leurs contrôles de fermeture conservés. Dialogues, fenêtres à taille fixe et fenêtres partagées exclus ; le redimensionnement manuel reste possible après l’ouverture.

- Accueil immédiatement stable au démarrage : pas de fondu initial ni de défilement vers la carte mémorisée ; priorité de chargement à cette carte. Clavier et diagnostics chargés à la demande, lecture audio et icône de notification différées après les premières frames.
- Mesures automatiques du démarrage par étape dans les journaux. Comparatif frontend sur Mac consigné dans `docs/STARTUP.md` ; durée native Windows non mesurée.

- Retour à l’accueil par la touche Xbox avec Start + Back en secours pour les nouvelles configurations ; choix Start + Back, LB + RB + Start et Désactivé conservés. Test de détection de 15 secondes et accès au réglage Windows Game Bar dans les paramètres. Détection native à valider sur une manette physique sous Windows.

- Clavier à l’écran AZERTY accessible à la manette pour rechercher et modifier les champs texte : accents, majuscules, symboles, correction et annulation avant validation.
- Écran de test de la manette : boutons, sticks, gâchettes et direction filtrée en direct, réglage de zone neutre entre deux essais et sortie du test par maintien de B / Rond.

- Sons de navigation activés par défaut pour les nouvelles installations ; le réglage reste désactivable et les préférences déjà enregistrées sont conservées.

- Reprise directe des applications suivies comme ouvertes avec un appui court sur Entrée / A / Croix ou un clic ; l’appui long conserve le menu de fermeture et de modification.

- Outils système masqués par défaut dans l’ajout d’applications, avec une case pour les afficher ; les applications déjà présentes sont marquées « Déjà ajoutée » et ne peuvent plus être sélectionnées.

- À l’ouverture des paramètres, le focus se place sur « Écran & démarrage » pour commencer directement la navigation dans les catégories.
- Ajout d’applications simplifié : suppression du formulaire et des suggestions de raccourcis web. Les raccourcis déjà enregistrés restent utilisables.
- Survol et sélection des applications plus visibles, avec un contour de focus intérieur qui ne déborde plus de la liste.

- Correction du retour au bureau Windows qui échouait avec « Classe non enregistrée : 0x80040154 ».
- Mises à jour intégrées signées pour les préreleases `0.x`, avec un canal distinct des versions stables.
- Publication du canal après vérification des fichiers de la release publique ; protection contre les brouillons, les fichiers incohérents et les retours de version.
- Les installations `v0.1.0` et `v0.2.0` nécessitent une dernière installation manuelle pour recevoir cette fonctionnalité.

## 0.2.0 — 2026-10-17

- Textes de l’interface simplifiés : titres et actions explicites, suppression des slogans et des sous-titres décoratifs.

- Commandes rapides à gauche de l’heure : volume général Windows, muet, choix de la sortie audio et veille avec confirmation dans un panneau latéral.
- Navigation du panneau au clavier et à la manette, actualisation des sorties connectées et restauration du focus ; commandes Windows à valider sur matériel réel.

- Menu rapide sur les cartes : maintien de 600 ms sur Entrée / A / Croix, clic droit, appui long tactile ou X / Carré ; indicateur de maintien et aucun lancement au relâchement d’un appui long.
- Modification, déplacement et retrait avec confirmation directement depuis une carte ; reprise et fermeture des sessions suivies, sélection conservée au retour.

- Navigation complète aux flèches et aux événements manette entre les cartes, boutons et champs ; Entrée valide et Retour arrière revient au menu précédent hors saisie.
- Mode d’édition explicite des champs, retour avec restauration du focus, confirmations centrées sur Annuler et protection contre les appuis prolongés.
- Validation automatisée de 76 états d’interface sur desktop et mobile ; essais avec une manette physique sous Windows encore à effectuer.

## 0.1.0 — 2026-10-16

Première prérelease publique de test de Canapey Launcher pour Windows 11 x64.

- Interface de salon avec carrousel, grille, ambiances embarquées et navigation clavier/manette.
- Ajout manuel et détection des applications Windows, raccourcis web YouTube, Netflix, Spotify et Internet.
- Réglages, retour au bureau, suivi des applications et stockage local de la configuration.
- Sources publiques, validation Windows par GitHub Actions et synchronisation des versions npm/Tauri/Rust.

Version expérimentale : les essais interactifs Windows, manettes physiques et mesures de performance restent à effectuer. Installateur sans signature Authenticode ; les mises à jour intégrées sont désactivées dans cette prérelease.
