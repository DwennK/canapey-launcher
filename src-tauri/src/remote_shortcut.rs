//! A deliberately small set of global keys, shared by configuration and registration.
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub struct RemoteShortcut {
    pub code: String,
    pub ctrl: bool,
    pub alt: bool,
    pub shift: bool,
}
impl RemoteShortcut {
    pub fn validate(&self) -> Result<(), String> {
        let function = self
            .code
            .strip_prefix('F')
            .and_then(|s| s.parse::<u8>().ok())
            .is_some_and(|n| {
                ((2..=11).contains(&n) || (13..=24).contains(&n)) && self.code == format!("F{n}")
            });
        let dedicated = function || matches!(self.code.as_str(), "Home" | "Pause");
        let letter = self
            .code
            .strip_prefix("Key")
            .is_some_and(|s| s.len() == 1 && s.as_bytes()[0].is_ascii_uppercase());
        let digit = self
            .code
            .strip_prefix("Digit")
            .is_some_and(|s| s.len() == 1 && s.as_bytes()[0].is_ascii_digit());
        if (dedicated && !self.ctrl && !self.alt && !self.shift)
            || (self.ctrl && self.alt && (letter || digit || function))
        {
            Ok(())
        } else {
            Err("Choisissez Ctrl + Alt + une lettre, ou une touche dédiée (Home, F2–F11, F13–F24). Flèches, Entrée et Échap restent réservés à la navigation.".into())
        }
    }
    pub fn validate_local(&self) -> Result<(), String> {
        let letter = self
            .code
            .strip_prefix("Key")
            .is_some_and(|s| s.len() == 1 && s.as_bytes()[0].is_ascii_uppercase());
        let digit = self
            .code
            .strip_prefix("Digit")
            .is_some_and(|s| s.len() == 1 && s.as_bytes()[0].is_ascii_digit());
        let function = self
            .code
            .strip_prefix('F')
            .and_then(|s| s.parse::<u8>().ok())
            .is_some_and(|n| (1..=24).contains(&n) && n != 12 && self.code == format!("F{n}"));
        let special = [
            "ArrowUp",
            "ArrowDown",
            "ArrowLeft",
            "ArrowRight",
            "Enter",
            "NumpadEnter",
            "Escape",
            "Backspace",
            "Space",
            "Tab",
            "Home",
            "End",
            "PageUp",
            "PageDown",
            "Insert",
            "Delete",
            "Pause",
        ]
        .contains(&self.code.as_str());
        if !(letter || digit || function || special)
            || (self.alt && ["Tab", "F4"].contains(&self.code.as_str()))
            || (self.ctrl && self.shift && self.code == "KeyQ")
        {
            return Err(
                "Touche invalide ou réservée. Programmez un raccourci clavier dédié dans Flirc."
                    .into(),
            );
        }
        Ok(())
    }
    pub fn accelerator(&self) -> String {
        let mut parts = Vec::new();
        if self.ctrl {
            parts.push("Control");
        }
        if self.alt {
            parts.push("Alt");
        }
        if self.shift {
            parts.push("Shift");
        }
        parts.push(&self.code);
        parts.join("+")
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RemoteBinding {
    pub button: String,
    pub key: RemoteShortcut,
    pub action: String,
    pub global: bool,
    pub app_id: Option<String>,
}
pub fn global_action(action: &str) -> bool {
    [
        "home",
        "launch",
        "volumeUp",
        "volumeDown",
        "mute",
        "playPause",
        "previousTrack",
        "nextTrack",
        "stop",
    ]
    .contains(&action)
}
pub fn validate_bindings(bindings: &[RemoteBinding]) -> Result<(), String> {
    use std::collections::HashSet;
    if bindings.len() > 40 {
        return Err("Trop de boutons associés.".into());
    }
    let mut buttons = HashSet::new();
    let mut keys = HashSet::new();
    for binding in bindings {
        let digit = binding
            .button
            .strip_prefix("digit")
            .is_some_and(|s| s.len() == 1 && s.as_bytes()[0].is_ascii_digit());
        let known = [
            "power",
            "previous",
            "play",
            "next",
            "home",
            "info",
            "up",
            "left",
            "ok",
            "right",
            "down",
            "menu",
            "back",
            "volumeUp",
            "volumeDown",
            "mute",
            "channelUp",
            "channelDown",
            "record",
            "stop",
            "red",
            "green",
            "blue",
            "yellow",
        ]
        .contains(&binding.button.as_str());
        if !(digit || known) || !buttons.insert(&binding.button) {
            return Err("Bouton inconnu ou associé plusieurs fois.".into());
        }
        if !keys.insert(&binding.key) {
            return Err("Cette touche est déjà associée à un autre bouton. Utilisez une touche distincte dans Flirc.".into());
        }
        binding.key.validate_local()?;
        if ![
            "home",
            "launch",
            "up",
            "down",
            "left",
            "right",
            "accept",
            "back",
            "menu",
            "options",
            "library",
            "audio",
            "power",
            "desktop",
            "volumeUp",
            "volumeDown",
            "mute",
            "playPause",
            "previousTrack",
            "nextTrack",
            "stop",
        ]
        .contains(&binding.action.as_str())
        {
            return Err("Action de télécommande inconnue.".into());
        }
        if binding.global {
            if !global_action(&binding.action) {
                return Err("Cette action fonctionne dans Canapey uniquement.".into());
            }
            binding.key.validate()?;
        }
        if binding.action == "launch"
            && !binding
                .app_id
                .as_ref()
                .is_some_and(|id| !id.is_empty() && id.len() <= 100 && !id.contains('\0'))
        {
            return Err("Choisissez une application pour ce bouton.".into());
        }
    }
    Ok(())
}
/// Reserve every added key before saving; roll back all new reservations on any failure.
pub fn replace_bindings(
    old: &[RemoteBinding],
    new: &[RemoteBinding],
    mut register: impl FnMut(&RemoteShortcut) -> Result<(), String>,
    save: impl FnOnce() -> Result<(), String>,
    mut unregister: impl FnMut(&RemoteShortcut),
) -> Result<(), String> {
    let added: Vec<_> = new
        .iter()
        .filter(|b| !old.iter().any(|o| o.key == b.key))
        .collect();
    let mut reserved = Vec::new();
    for binding in added {
        if let Err(error) = register(&binding.key) {
            for key in reserved {
                unregister(key);
            }
            return Err(error);
        }
        reserved.push(&binding.key);
    }
    if let Err(error) = save() {
        for key in reserved {
            unregister(key);
        }
        return Err(error);
    }
    for binding in old.iter().filter(|b| !new.iter().any(|n| n.key == b.key)) {
        unregister(&binding.key);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    fn key(code: &str) -> RemoteShortcut {
        RemoteShortcut {
            code: code.into(),
            ctrl: false,
            alt: false,
            shift: false,
        }
    }
    fn binding(button: &str, code: &str) -> RemoteBinding {
        RemoteBinding {
            button: button.into(),
            key: key(code),
            action: "home".into(),
            global: true,
            app_id: None,
        }
    }
    #[test]
    fn local_navigation_is_allowed_but_global_navigation_is_rejected() {
        for code in [
            "Enter",
            "Escape",
            "ArrowUp",
            "Backspace",
            "Tab",
            "Space",
            "KeyH",
            "F1",
        ] {
            assert!(key(code).validate_local().is_ok());
            assert!(key(code).validate().is_err());
        }
        for code in ["F12", "F25", "F02", "AudioVolumeUp"] {
            assert!(key(code).validate_local().is_err());
        }
        for code in ["Home", "Pause", "F2", "F11", "F13", "F24"] {
            assert!(key(code).validate().is_ok());
        }
        let mut h = key("KeyH");
        h.ctrl = true;
        h.alt = true;
        assert_eq!(h.accelerator(), "Control+Alt+KeyH");
        assert!(h.validate().is_ok());
    }
    #[test]
    fn duplicate_signals_unknown_buttons_and_invalid_actions_are_rejected() {
        assert!(validate_bindings(&[binding("home", "F10"), binding("info", "F10")]).is_err());
        assert!(validate_bindings(&[binding("home", "F10"), binding("home", "F9")]).is_err());
        assert!(validate_bindings(&[binding("activityA", "F10")]).is_err());
        let mut b = binding("digit1", "F10");
        b.action = "launch".into();
        assert!(validate_bindings(&[b.clone()]).is_err());
        b.app_id = Some("app".into());
        assert!(validate_bindings(&[b.clone()]).is_ok());
        b.action = "up".into();
        assert!(validate_bindings(&[b.clone()]).is_err());
        b.global = false;
        b.key = key("ArrowUp");
        assert!(validate_bindings(&[b]).is_ok());
    }
    #[test]
    fn conflict_rolls_back_new_keys_without_saving_or_removing_old() {
        let calls = RefCell::new(vec![]);
        let old = [binding("home", "F8")];
        let new = [binding("home", "F9"), binding("info", "F10")];
        assert!(replace_bindings(
            &old,
            &new,
            |k| {
                if k.code == "F10" {
                    return Err("conflict".into());
                }
                calls.borrow_mut().push(format!("reserve {}", k.code));
                Ok(())
            },
            || panic!("must not save"),
            |k| calls.borrow_mut().push(format!("remove {}", k.code))
        )
        .is_err());
        assert_eq!(*calls.borrow(), ["reserve F9", "remove F9"]);
    }
    #[test]
    fn failed_save_releases_only_new_reservations() {
        let calls = RefCell::new(vec![]);
        assert!(replace_bindings(
            &[binding("home", "F9")],
            &[binding("home", "F10")],
            |_| Ok(()),
            || Err("disk full".into()),
            |k| calls.borrow_mut().push(k.code.clone())
        )
        .is_err());
        assert_eq!(*calls.borrow(), ["F10"]);
    }
    #[test]
    fn changed_action_reuses_key_and_disable_releases_after_save() {
        let old = [binding("home", "F9")];
        let mut new = old.clone();
        new[0].action = "mute".into();
        replace_bindings(&old, &new, |_| panic!(), || Ok(()), |_| panic!()).unwrap();
        let calls = RefCell::new(vec![]);
        replace_bindings(
            &old,
            &[],
            |_| panic!(),
            || {
                calls.borrow_mut().push("save");
                Ok(())
            },
            |_| calls.borrow_mut().push("remove"),
        )
        .unwrap();
        assert_eq!(*calls.borrow(), ["save", "remove"]);
    }
    #[test]
    fn legacy_home_migrates_and_all_bindings_survive_reload() {
        let dir = tempfile::tempdir().unwrap();
        let store = crate::config::ConfigStore::new(dir.path().into());
        let mut config = crate::model::Config::default();
        config.settings.remote_home = Some(key("F10"));
        config.settings.migrate_remote();
        assert!(config.settings.remote_home.is_none());
        assert_eq!(config.settings.remote_bindings[0], binding("home", "F10"));
        config
            .settings
            .remote_bindings
            .push(binding("digit2", "F9"));
        store.save(&config).unwrap();
        assert_eq!(
            store.load().0.settings.remote_bindings,
            config.settings.remote_bindings
        );
        let old: crate::model::Settings = serde_json::from_str(r#"{"sound":false}"#).unwrap();
        assert!(old.remote_bindings.is_empty());
    }
}
