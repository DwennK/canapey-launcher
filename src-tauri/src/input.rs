// Timestamp-driven input: hysteresis, immediate press, delayed repeat, no catch-up queue.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Direction {
    Left,
    Right,
    Up,
    Down,
}
impl Direction {
    pub fn action(self) -> &'static str {
        match self {
            Self::Left => "left",
            Self::Right => "right",
            Self::Up => "up",
            Self::Down => "down",
        }
    }
}
#[derive(Default)]
pub struct Repeater {
    held: Option<Direction>,
    next: u64,
}
impl Repeater {
    pub fn tick(&mut self, d: Option<Direction>, now: u64) -> Option<Direction> {
        if d != self.held {
            self.held = d;
            self.next = now + 360;
            return d;
        }
        if d.is_some() && now >= self.next {
            self.next = now + 110;
            return d;
        }
        None
    }
    pub fn reset(&mut self) {
        self.held = None;
        self.next = 0;
    }
}
pub fn stick(x: f32, y: f32, deadzone: f32, previous: Option<Direction>) -> Option<Direction> {
    let threshold = if previous.is_some() {
        deadzone
    } else {
        (deadzone + 0.20).min(0.75)
    };
    if x.abs().max(y.abs()) < threshold {
        return None;
    }
    Some(if x.abs() > y.abs() {
        if x > 0.0 {
            Direction::Right
        } else {
            Direction::Left
        }
    } else if y > 0.0 {
        Direction::Up
    } else {
        Direction::Down
    })
}
#[derive(Default)]
pub struct Hold {
    since: Option<u64>,
    fired: bool,
}
impl Hold {
    pub fn tick(&mut self, pressed: bool, now: u64, duration: u64) -> bool {
        if !pressed {
            self.since = None;
            self.fired = false;
            return false;
        }
        let start = *self.since.get_or_insert(now);
        if !self.fired && now.saturating_sub(start) >= duration {
            self.fired = true;
            return true;
        }
        false
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn repeat_does_not_burst_after_sleep() {
        let mut r = Repeater::default();
        assert_eq!(r.tick(Some(Direction::Right), 0), Some(Direction::Right));
        assert_eq!(r.tick(Some(Direction::Right), 200), None);
        assert!(r.tick(Some(Direction::Right), 50000).is_some());
        assert!(r.tick(Some(Direction::Right), 50001).is_none());
        r.tick(None, 50002);
        assert!(r.tick(Some(Direction::Right), 50003).is_some());
    }
    #[test]
    fn release_hysteresis_and_hold() {
        assert_eq!(stick(0.3, 0.0, 0.24, None), None);
        assert_eq!(
            stick(0.3, 0.0, 0.24, Some(Direction::Right)),
            Some(Direction::Right)
        );
        assert_eq!(stick(0.1, 0.0, 0.24, Some(Direction::Right)), None);
        let mut h = Hold::default();
        assert!(!h.tick(true, 0, 1000));
        assert!(h.tick(true, 1000, 1000));
        assert!(!h.tick(true, 2000, 1000));
        h.tick(false, 2100, 1000);
        assert!(!h.tick(true, 2200, 1000));
    }
}
