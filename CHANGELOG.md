# Notes de version

## À venir

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
