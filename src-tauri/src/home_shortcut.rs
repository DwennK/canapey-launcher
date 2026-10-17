//! Global shortcuts use independent controller slots; buttons from two pads never form a chord.
use crate::input::Hold;

pub const GUIDE: u16 = 0x0400;
pub const START: u16 = 0x0010;
pub const BACK: u16 = 0x0020;
pub const LB: u16 = 0x0100;
pub const RB: u16 = 0x0200;

#[derive(Default)]
pub struct HomeShortcut {
    previous: [Option<u16>; 4],
    holds: [Hold; 4],
    mode: String,
    last_tick: Option<u64>,
}

#[derive(Default, Debug)]
pub struct ShortcutEvent {
    pub guide: bool,
    pub home: bool,
}

impl HomeShortcut {
    pub fn tick(
        &mut self,
        pads: [Option<u16>; 4],
        mode: &str,
        background: bool,
        now: u64,
        hold_ms: u64,
    ) -> ShortcutEvent {
        let reset = self.mode != mode
            || self
                .last_tick
                .is_some_and(|last| now.saturating_sub(last) > 2000);
        if reset {
            self.holds = Default::default();
            self.previous = [None; 4];
            self.mode = mode.into();
        }
        self.last_tick = Some(now);
        let mut event = ShortcutEvent::default();
        for (slot, buttons) in pads.into_iter().enumerate() {
            let previous = self.previous[slot];
            self.previous[slot] = buttons;
            let Some(buttons) = buttons else {
                self.holds[slot] = Hold::default();
                continue;
            };
            // A held Guide at startup/reconnect/mode change is not a fresh press.
            let guide = previous.is_some_and(|p| p & GUIDE == 0) && buttons & GUIDE != 0;
            event.guide |= guide;
            event.home |= mode == "xbox" && guide;
            let mask = match mode {
                "xbox" | "startBack" => START | BACK,
                "shouldersStart" => LB | RB | START,
                _ => 0,
            };
            event.home |= self.holds[slot].tick(
                background && mask != 0 && buttons & mask == mask,
                now,
                hold_ms,
            );
        }
        event
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_to_xbox_without_overwriting_saved_choices() {
        use crate::model::{Config, Settings};
        assert_eq!(Settings::default().return_shortcut, "xbox");
        for mode in ["xbox", "startBack", "shouldersStart", "disabled"] {
            let settings: Settings =
                serde_json::from_value(serde_json::json!({ "returnShortcut": mode })).unwrap();
            assert_eq!(settings.return_shortcut, mode);
            assert!(Config {
                settings,
                ..Config::default()
            }
            .validate()
            .is_ok());
        }
    }
    fn pad(b: u16) -> [Option<u16>; 4] {
        [Some(b), None, None, None]
    }

    #[test]
    fn guide_is_one_press_and_requires_release_after_connect() {
        let mut r = HomeShortcut::default();
        assert!(!r.tick(pad(GUIDE), "xbox", true, 0, 1200).home);
        r.tick(pad(0), "xbox", true, 1, 1200);
        assert!(r.tick(pad(GUIDE), "xbox", true, 2, 1200).home);
        assert!(!r.tick(pad(GUIDE), "xbox", true, 3, 1200).home);
        r.tick([None; 4], "xbox", true, 4, 1200);
        assert!(!r.tick(pad(GUIDE), "xbox", true, 5, 1200).home);
    }

    #[test]
    fn xbox_has_start_back_fallback_but_chords_do_not_cross_controllers() {
        let mut r = HomeShortcut::default();
        let split = [Some(START), Some(BACK), None, None];
        r.tick(split, "xbox", true, 0, 1200);
        assert!(!r.tick(split, "xbox", true, 1200, 1200).home);
        r.tick(pad(START | BACK), "xbox", true, 1300, 1200);
        assert!(r.tick(pad(START | BACK), "xbox", true, 2500, 1200).home);
        assert!(!r.tick(pad(START | BACK), "xbox", true, 2600, 1200).home);
    }

    #[test]
    fn alternative_disabled_and_test_modes_do_not_trigger_guide_home() {
        for mode in ["startBack", "shouldersStart", "disabled", "test"] {
            let mut r = HomeShortcut::default();
            r.tick(pad(0), mode, true, 0, 1200);
            let e = r.tick(pad(GUIDE), mode, true, 1, 1200);
            assert!(e.guide);
            assert!(!e.home);
        }
        let mut r = HomeShortcut::default();
        r.tick(pad(LB | RB | START), "shouldersStart", true, 0, 1200);
        assert!(
            r.tick(pad(LB | RB | START), "shouldersStart", true, 1200, 1200)
                .home
        );
    }

    #[test]
    fn focus_and_setting_changes_and_sleep_reset_hold() {
        let mut r = HomeShortcut::default();
        r.tick(pad(START | BACK), "xbox", true, 0, 1200);
        assert!(!r.tick(pad(START | BACK), "xbox", false, 1200, 1200).home);
        assert!(
            !r.tick(pad(START | BACK), "startBack", true, 1300, 1200)
                .home
        );
        assert!(
            !r.tick(pad(START | BACK), "startBack", true, 10000, 1200)
                .home
        );
    }
}
