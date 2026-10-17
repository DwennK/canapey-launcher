# Retour à l’accueil avec la touche Xbox

Les nouvelles configurations utilisent `xbox` : un appui sur Xbox, avec Start + Back maintenus en secours. Les préférences déjà enregistrées ne sont pas modifiées. Les modes `startBack`, `shouldersStart` et `disabled` restent disponibles. La durée configurable ne concerne que les combinaisons. Revenir à Canapey ne ferme pas l’application ouverte et ne garantit pas sa mise en pause.

## Implémentation

- Navigation au premier plan : gilrs / Windows Gaming Input, comme auparavant.
- Lecture complémentaire des quatre emplacements XInput, toutes les 12 ms, indépendante du focus. Les combinaisons en arrière-plan sont suivies séparément pour chaque manette ; les boutons de plusieurs manettes ne sont jamais assemblés.
- La DLL `xinput1_4.dll` est chargée exclusivement depuis System32. L’extension Guide par ordinal 100 est **non documentée par Microsoft**, également employée par [SDL](https://github.com/libsdl-org/SDL/blob/main/src/core/windows/SDL_xinput.c). Si elle manque, repli sur `XInputGetState` pour les combinaisons et indication de détection Xbox indisponible.
- Un bouton Xbox déjà maintenu au démarrage, à la reconnexion ou au changement de mode doit être relâché avant d’être pris en compte. Un maintien ne répète pas le retour. Une interruption de lecture de plus de deux secondes remet les maintiens à zéro.
- Le test dédié écoute pendant 15 secondes, y compris si Game Bar prend le focus. Un appui reçu valide uniquement la détection, sans retour à l’accueil. Il ne prouve pas l’absence d’un conflit avec Windows ou Steam. Fermer ce panneau annule son test ; un délai natif limite aussi l’écoute si le frontend disparaît.
- Le test général de la manette suspend les retours Xbox. La lecture des autres boutons reste gérée par son propre panneau.
- Le bouton Game Bar ouvre uniquement l’URI fixe `ms-settings:gaming-gamebar`. Aucun changement du Registre, aucune désinstallation et aucune désactivation automatique. Désactiver l’option permettant à la manette d’ouvrir Game Bar laisse Windows + G disponible.

## Limites et validation

La touche Xbox et les retours XInput en arrière-plan nécessitent une manette exposée comme périphérique XInput. Une manette PlayStation peut nécessiter un pilote/mappage adapté ; Canapey n’en installe pas. Les manettes uniquement WGI gardent leur navigation et leurs combinaisons existantes, mais leur réception en arrière-plan dépend du pilote. Windows, Steam Input et les overlays peuvent intercepter le bouton. Un test concluant sur une connexion USB ne prouve pas son fonctionnement en Bluetooth.

Vérifications locales : tests Rust de la logique d’appui/maintien, compilation et Clippy Windows croisés, tests d’interface desktop/mobile. **Aucune manette physique ni exécution native Windows validée ici.**

À vérifier sur le PC cible :

1. USB puis Bluetooth : détection d’un appui, maintien sans répétition, déconnexion/reconnexion avec bouton maintenu.
2. Depuis un jeu ou une application, retour Xbox puis Start + Back ; vérifier que l’application reste ouverte et peut être reprise.
3. Choix LB + RB + Start : seul ce raccourci provoque le retour ; mode Désactivé : aucun retour global.
4. Deux manettes : chaque combinaison doit venir d’une seule manette.
5. Game Bar activée puis raccourci désactivé, Steam Input activé/désactivé ; vérifier les éventuels conflits et le lien vers les paramètres Windows.
6. Test dédié : réussite, délai expiré, annulation, fermeture des paramètres et passage au test général de la manette.

Références : [URI des paramètres Windows](https://learn.microsoft.com/en-us/windows/apps/develop/launch/launch-settings), [Game Bar](https://support.microsoft.com/en-gb/accessibility/windows/use-a-screen-reader-to-record-your-screen-with-xbox-game-bar), [limites Windows de gilrs](https://docs.rs/gilrs/latest/gilrs/).
