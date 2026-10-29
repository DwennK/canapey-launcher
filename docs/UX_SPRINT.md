# Sprint UX — 29 octobre 2026

État : implémentation locale, version inchangée 0.5.0, non publiée. Aucun installateur Windows construit ni installé pendant ce sprint.

## Changements

- Accueil : applications en cours puis favoris, sans doublons ; les six premières applications servent de point de départ en l’absence de favoris et de sessions. Actions explicites Ouvrir / Reprendre, menu Actions et carte vers la bibliothèque.
- Bibliothèque : recherche insensible aux accents, filtres Tout / Favoris / Jeux / Vidéo / Musique / Autres, tri personnel / alphabétique / catégorie. Les catégories automatiques reposent sur le nom et la cible, jamais sur l’ambiance visuelle ; l’éditeur permet de les corriger. Les favoris sont accessibles dans les actions de carte et dans la gestion des applications.
- Paramètres : cinq sections, dernière page mémorisée, état de sauvegarde et message d’échec avec restauration des valeurs. Affichage et ambiance ; Applications ; Manettes et télécommandes ; Démarrage et système ; Aide et mises à jour.
- Manettes : test intégré dans la même page, dépannage Xbox / Steam Input repliable. Les arrêts de capture existants restent actifs.
- Télécommande : guide des dix boutons essentiels, sauvegarde par étape, passage facultatif, reprise au premier bouton non associé, résumé des associations et accès au formulaire personnalisé. Les conflits empêchent l’enregistrement ; quitter ou passer ne crée pas d’association.
- Ajout : détection à la première ouverture, recherche focalisée, résultats conservés pendant la session, relance en cas d’erreur et libellé Ajouter N applications.
- Lisibilité : textes et commandes agrandis, navigation mobile visible, focus entre sous-pages restauré, clavier virtuel utilisable pour rechercher dans la bibliothèque. Retour Windows déplacé dans le menu d’alimentation et les réglages système.

## Persistance et compatibilité

`Settings.library` conserve favoris, catégories et tri ; `lastSettingsTab` conserve la page des paramètres. Les valeurs par défaut Serde permettent de charger les configurations antérieures. Tests de sauvegarde/rechargement et de rejet de catégorie invalide. Le stockage isolé de l’aperçu normalise également les préférences manquantes ou mal formées. Aucun fichier de données utilisateur Windows n’a été touché.

## Validation effectuée

- `npm run check` : version cohérente, compilation frontend, tests TypeScript et Rust réussis. Après les dernières corrections frontend : `npm run build`, `npm test`, `npm run version:check` et `cargo fmt --manifest-path src-tauri/Cargo.toml --check` réussis.
- Résultat final : 75 tests TypeScript dans 13 fichiers ; 48 tests Rust. Les tests Rust utilisent `--no-default-features` sur macOS.
- Chrome système, profil isolé, à 1440 × 900 et 390 × 844 ; contrôle supplémentaire à 1920 × 1080 avec texte à 140 % et préférence système de réduction des animations.
- Parcours : favoris, recherche accentuée, filtres combinés, résultat vide, tri, catégorie modifiée, persistance après rechargement, sous-pages et retour du focus, clavier virtuel et arrière-plan inerte, première ligne de grille vers recherche.
- Guide : apprentissage au clavier dans l’aperçu, conflit de raccourci, enregistrement, passage et reprise, focus à la sortie. Aucune réservation système Windows dans cet essai.
- Sauvegarde : succès visible ; échec de stockage simulé et retour à la valeur enregistrée. Confirmation d’alimentation focalisée sur Annuler, sans exécuter l’action système.
- Pont Windows simulé uniquement pour vérifier détection automatique, échec et relance, import multiple, sélection de la première carte importée, déduplication, cache de détection et présentation d’une session en cours. La simulation a été retirée après le test.
- Inspection interactive complémentaire dans le navigateur intégré. Pas d’erreur ni d’avertissement console dans le contrôle final.

Les scripts, résultats et captures locaux sont dans `output/playwright/ux-sprint/` (ignorés par Git). Le rapport visuel est `output/playwright/ux-sprint/rapport.html`. Certaines premières assertions de test ont été ajustées pour attendre la fin des transitions et cibler les libellés accessibles exacts ; les parcours finaux décrits ci-dessus sont passés.

## Limites

Lancement et fermeture d’applications, découverte réelle, raccourcis globaux, sorties audio, manettes physiques, Skip 1s / Flirc et iPhone restent à vérifier sur un PC Windows. Les essais navigateur et le pont simulé ne prouvent pas le fonctionnement natif. Aucune certification d’accessibilité ni mesure de lecture à distance sur une TV réelle.

## Espace disque

Les sorties Cargo dédiées à ce sprint et `dist/` ont été supprimés après validation : environ 497 Mio récupérés (mesure exacte dans `output/playwright/ux-sprint/cleanup.txt`). Sources, dépendances, captures et aperçu Vite conservés.
