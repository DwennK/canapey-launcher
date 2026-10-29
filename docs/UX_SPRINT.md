# Sprint UX — 29 octobre 2026

État initial du sprint : implémentation locale, version inchangée 0.5.0, non publiée. Aucun installateur Windows construit ni installé localement.

Mise à jour : sprint commité et poussé le 29 octobre (`a67e379`, `e7b2986`, `fc65b09`). Le job Windows du run [40795854630](https://github.com/DwennK/canapey-launcher/actions/runs/40795854630) a réussi, y compris la construction de l’installateur non signé. L’échec Companion préexistant a été corrigé séparément par `c124046`, avec test local complet réussi puis réussite du job Companion en CI. Pas de nouvelle release ni d’installation locale. L’itération ci-dessous complète ce sprint et est regroupée dans un commit UX distinct de l’intégration YouTube.

## Seconde itération

### Correction des cartes sans image

Les huit cartes de la capture disposent déjà de visuels photographiques dans `public/art/` ; aucune nouvelle génération ImageGen n’était nécessaire. Les fichiers ont été inspectés et les huit miniatures décodées à 640 × 360. Les premières rangées chargent désormais leurs images immédiatement (le reste de la bibliothèque garde le chargement différé). L’ancien gestionnaire d’erreur masquait l’élément image sans recours et pouvait le laisser masqué après changement de source : il est remplacé par une chaîne image personnalisée → thème → Salon, avec remise à zéro des erreurs lors d’un changement de source. Le fond plein écran essaie également ses variantes intégrées avant d’abandonner un fichier défectueux.

Compilation et 81 tests TypeScript réussis. Parcours Chrome isolé à 1440 × 1000 et 390 × 844 : huit fonds visibles, chargement immédiat, image volontairement corrompue, secours par Salon, récupération après rechargement, image personnalisée de carte et fond défectueux, changement de thème après erreur et identité du logo conservée. Preuves dans `output/playwright/artwork-fix/` ; résultats des deux scripts `passed: true`. Rendu final capturé après stabilisation du viewport. Ces corrections font partie de la seconde itération UX.

Validation distante finale du sprint poussé : [run 40796398721](https://github.com/DwennK/canapey-launcher/actions/runs/40796398721) réussi, jobs Windows et Companion verts, installateur de test non signé généré. Cette CI ne contient pas les modifications locales de bibliothèque décrites ci-dessous.

- Restaurer la dernière carte retirée avec sa position, son favori et sa catégorie, sans annuler les autres modifications effectuées ensuite. Le message reste disponible dans la bibliothèque et les réglages Applications jusqu’à fermeture, retrait suivant ou redémarrage. Échec de sauvegarde : la carte reste retirée, le message permet de réessayer. Doublons et capacité maximale restent protégés.
- Compteurs par catégorie tenant compte de la recherche, résultat sur le total, effacement de la recherche conservant le filtre et retour du focus dans le champ. Aide spécifique lorsqu’aucun favori n’existe.
- Un déplacement active le tri personnalisé, ce qui évite un déplacement invisible sous un tri alphabétique. Le formulaire annonce ce comportement.
- Validation : compilation et contrôle de version réussis ; 79 tests TypeScript dans 14 fichiers. Chrome système isolé à 1440 × 900 et 390 × 844 : suppression, annulation proposée par défaut, restauration et métadonnées, échec puis nouvelle tentative, dernière carte, navigation clavier, rechargement, réglages Applications, filtres et focus. Console sans erreur ni avertissement. Contrôle complémentaire des filtres dans le navigateur intégré.
- Preuves locales : `output/playwright/ux-iteration/`, avec deux scripts de parcours et résultats explicites `passed: true`. Les captures attendent la fermeture des panneaux et notifications.
- Aucun code Rust modifié pendant cette itération. La correction CI fige uniquement la dépendance de développement `srptools==1.0.1` compatible avec le constructeur appelé par pyatv 0.18.0 ; aucune dépendance de l’application distribuée n’est modifiée. Oracle complet local : mauvais PIN, association, vérification chiffrée, commandes, reconnexion et révocation réussis.
- Nettoyage après validation : cible Cargo temporaire, environnement Python isolé et `dist/` retirés ; 501,2 Mio récupérés. Sources, dépendances partagées, preuves et aperçu Vite conservés.

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
