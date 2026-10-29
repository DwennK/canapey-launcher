//! Keyboard inputs supported by the Windows global shortcut backend.
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
        self.validate_local()
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
        let numpad = self
            .code
            .strip_prefix("Numpad")
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
            "CapsLock",
            "NumLock",
            "ScrollLock",
            "PrintScreen",
            "Equal",
            "Comma",
            "Minus",
            "Period",
            "Semicolon",
            "Slash",
            "Backquote",
            "BracketLeft",
            "Backslash",
            "BracketRight",
            "Quote",
            "NumpadAdd",
            "NumpadDecimal",
            "NumpadDivide",
            "NumpadMultiply",
            "NumpadSubtract",
            "AudioVolumeUp",
            "AudioVolumeDown",
            "AudioVolumeMute",
            "MediaPlay",
            "MediaPause",
            "MediaPlayPause",
            "MediaStop",
            "MediaTrackNext",
            "MediaTrackPrevious",
        ]
        .contains(&self.code.as_str());
        if !(letter || digit || numpad || function || special)
            || (self.alt && ["Tab", "F4"].contains(&self.code.as_str()))
            || (self.ctrl && self.shift && ["KeyQ", "Escape"].contains(&self.code.as_str()))
            || (self.ctrl && self.alt && ["Delete", "Escape"].contains(&self.code.as_str()))
        {
            return Err("Invalid key or key reserved by Windows. Choose another key.".into());
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
        parts.push(match self.code.as_str() {
            "NumpadEnter" => "Enter",
            "MediaPause" => "Pause",
            code => code,
        });
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
pub fn interface_action(action: &str) -> bool {
    [
        "up", "down", "left", "right", "accept", "back", "menu", "options", "library", "audio",
        "power",
    ]
    .contains(&action)
}
pub fn validate_bindings(bindings: &[RemoteBinding]) -> Result<(), String> {
    use std::collections::HashSet;
    if bindings.len() > 40 {
        return Err("Too many mapped buttons.".into());
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
            return Err("Unknown button or button mapped more than once.".into());
        }
        if !keys.insert(binding.key.accelerator()) {
            return Err(
                "This key is already mapped to another button. Use a different key in Flirc."
                    .into(),
            );
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
            "taskView",
            "closeWindow",
            "escape",
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
            return Err("Unknown remote action.".into());
        }
        if !binding.global
            && (binding.key.code.starts_with("AudioVolume")
                || binding.key.code.starts_with("Media"))
        {
            return Err("Enable global mode to remap a media key.".into());
        }
        if binding.global {
            binding.key.validate()?;
        }
        if binding.action == "launch"
            && !binding
                .app_id
                .as_ref()
                .is_some_and(|id| !id.is_empty() && id.len() <= 100 && !id.contains('\0'))
        {
            return Err("Choose an app for this button.".into());
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
        .filter(|b| {
            !old.iter()
                .any(|o| o.key.accelerator() == b.key.accelerator())
        })
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
    for binding in old.iter().filter(|b| {
        !new.iter()
            .any(|n| n.key.accelerator() == b.key.accelerator())
    }) {
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
    fn ordinary_and_media_keys_are_accepted_globally() {
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
            assert!(key(code).validate().is_ok());
        }
        for code in ["F12", "F25", "F02", "NumpadEqual"] {
            assert!(key(code).validate_local().is_err());
        }
        for code in [
            "Home",
            "Pause",
            "F2",
            "F11",
            "F13",
            "F24",
            "AudioVolumeUp",
            "MediaPlayPause",
            "Numpad1",
            "Semicolon",
        ] {
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
        assert!(validate_bindings(&[b.clone()]).is_ok());
        b.global = false;
        b.key = key("ArrowUp");
        assert!(validate_bindings(&[b]).is_ok());
    }
    #[test]
    fn windows_key_aliases_conflict_and_interface_actions_route() {
        assert!(
            validate_bindings(&[binding("home", "Enter"), binding("info", "NumpadEnter")]).is_err()
        );
        assert!(
            validate_bindings(&[binding("home", "Pause"), binding("info", "MediaPause")]).is_err()
        );
        for action in [
            "up", "down", "left", "right", "accept", "back", "menu", "options", "library", "audio",
            "power",
        ] {
            assert!(interface_action(action));
            let mut b = binding("home", "KeyH");
            b.action = action.into();
            assert!(validate_bindings(&[b]).is_ok());
        }
        for action in ["taskView", "closeWindow", "escape"] {
            let mut b = binding("info", "F10");
            b.action = action.into();
            assert!(validate_bindings(&[b]).is_ok());
            assert!(!interface_action(action));
        }
        for action in ["home", "launch", "desktop", "mute", "playPause", "unknown"] {
            assert!(!interface_action(action));
        }
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
        replace_bindings(
            &[binding("home", "NumpadEnter")],
            &[binding("home", "Enter")],
            |_| panic!("alias must reuse reservation"),
            || Ok(()),
            |_| panic!("alias must stay registered"),
        )
        .unwrap();
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
