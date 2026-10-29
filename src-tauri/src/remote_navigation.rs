//! Route global navigation without activating the launcher. An OK press owns
//! its original recipient until release; repeated key-downs cannot validate twice.
use std::collections::HashMap;

#[derive(Debug, PartialEq, Eq)]
pub enum Delivery {
    None,
    Press,
    Release,
    Cancel,
}

enum Recipient<T> {
    Launcher,
    External(T),
    Failed,
}

pub struct RemoteNavigation<T> {
    accepts: HashMap<String, Recipient<T>>,
}
impl<T> Default for RemoteNavigation<T> {
    fn default() -> Self {
        Self {
            accepts: HashMap::new(),
        }
    }
}
impl<T> RemoteNavigation<T> {
    pub fn dispatch(
        &mut self,
        button: &str,
        action: &str,
        pressed: bool,
        focused: bool,
        mut external: impl FnMut(&str) -> Result<T, String>,
    ) -> Result<Delivery, String> {
        // Release by physical button, even if its configured action changed.
        if !pressed {
            return Ok(match self.accepts.remove(button) {
                Some(Recipient::Launcher) if focused => Delivery::Release,
                Some(Recipient::Launcher) => Delivery::Cancel,
                _ => Delivery::None, // Dropping the external guard releases its original window.
            });
        }
        if self.accepts.contains_key(button) {
            return Ok(Delivery::None);
        }
        if action == "accept" {
            if focused {
                self.accepts.insert(button.into(), Recipient::Launcher);
                return Ok(Delivery::Press);
            }
            // Remember failures too: a repeated down must not switch recipients.
            self.accepts.insert(button.into(), Recipient::Failed);
            let guard = external(action)?;
            self.accepts
                .insert(button.into(), Recipient::External(guard));
            return Ok(Delivery::None);
        }
        if focused {
            Ok(Delivery::Press)
        } else {
            if matches!(action, "up" | "down" | "left" | "right" | "back") {
                drop(external(action)?);
            }
            // Launcher-only panels never steal focus from an external app.
            Ok(Delivery::None)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{cell::RefCell, rc::Rc};
    struct Key(Rc<RefCell<Vec<String>>>);
    impl Drop for Key {
        fn drop(&mut self) {
            self.0.borrow_mut().push("up:original".into());
        }
    }
    #[test]
    fn external_ok_keeps_recipient_and_ignores_duplicate_down() {
        let log = Rc::new(RefCell::new(Vec::new()));
        let mut router = RemoteNavigation::default();
        let mut send = |action: &str| {
            log.borrow_mut().push(format!("down:{action}"));
            Ok(Key(log.clone()))
        };
        assert_eq!(
            router
                .dispatch("ok", "accept", true, false, &mut send)
                .unwrap(),
            Delivery::None
        );
        assert_eq!(
            router
                .dispatch("ok", "accept", true, true, &mut send)
                .unwrap(),
            Delivery::None
        );
        assert_eq!(
            router
                .dispatch("ok", "accept", false, true, &mut send)
                .unwrap(),
            Delivery::None
        );
        assert_eq!(*log.borrow(), ["down:accept", "up:original"]);
    }
    #[test]
    fn launcher_ok_validates_once_or_cancels_after_focus_loss() {
        let mut router = RemoteNavigation::<()>::default();
        for focused_on_release in [true, false] {
            assert_eq!(
                router
                    .dispatch("ok", "accept", true, true, |_| panic!())
                    .unwrap(),
                Delivery::Press
            );
            assert_eq!(
                router
                    .dispatch("ok", "accept", true, true, |_| panic!())
                    .unwrap(),
                Delivery::None
            );
            assert_eq!(
                router
                    .dispatch("ok", "accept", false, focused_on_release, |_| panic!())
                    .unwrap(),
                if focused_on_release {
                    Delivery::Release
                } else {
                    Delivery::Cancel
                }
            );
            assert_eq!(
                router
                    .dispatch("ok", "accept", false, true, |_| panic!())
                    .unwrap(),
                Delivery::None
            );
        }
    }
    #[test]
    fn navigation_targets_external_app_and_panels_do_not_restore_launcher() {
        let mut router = RemoteNavigation::<()>::default();
        for action in ["up", "down", "left", "right", "back"] {
            let mut sent = Vec::new();
            assert_eq!(
                router
                    .dispatch(action, action, true, false, |a| {
                        sent.push(a.to_string());
                        Ok(())
                    })
                    .unwrap(),
                Delivery::None
            );
            assert_eq!(sent, [action]);
            assert_eq!(
                router
                    .dispatch(action, action, true, true, |_| panic!())
                    .unwrap(),
                Delivery::Press
            );
        }
        for action in ["menu", "options", "library", "audio", "power"] {
            assert_eq!(
                router
                    .dispatch(action, action, true, false, |_| panic!())
                    .unwrap(),
                Delivery::None
            );
            assert_eq!(
                router
                    .dispatch(action, action, true, true, |_| panic!())
                    .unwrap(),
                Delivery::Press
            );
        }
    }
    #[test]
    fn failed_press_cannot_turn_into_launcher_validation() {
        let mut router = RemoteNavigation::<()>::default();
        assert!(router
            .dispatch("ok", "accept", true, false, |_| Err("no window".into()))
            .is_err());
        assert_eq!(
            router
                .dispatch("ok", "accept", true, true, |_| panic!())
                .unwrap(),
            Delivery::None
        );
        assert_eq!(
            router
                .dispatch("ok", "accept", false, true, |_| panic!())
                .unwrap(),
            Delivery::None
        );
    }
}
