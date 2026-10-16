use serde::Serialize;
use std::collections::{HashMap, HashSet};
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct ProcessKey {
    pub pid: u32,
    pub born: u64,
}
#[derive(Debug, Clone)]
pub struct Process {
    pub key: ProcessKey,
    pub parent: u32,
    pub path: String,
}
#[derive(Debug, Clone)]
pub struct Window {
    pub handle: isize,
    pub process: ProcessKey,
}
#[derive(Debug, Clone)]
pub struct Session {
    pub app_id: String,
    pub name: String,
    pub known: HashSet<ProcessKey>,
    pub owned: HashSet<ProcessKey>,
    pub windows: Vec<Window>,
    pub baseline: HashSet<ProcessKey>,
    pub expected_path: Option<String>,
    pub launched_at: u64,
    pub last_seen: u64,
    pub seen_window: bool,
    pub untracked: bool,
    pub closing_at: Option<u64>,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionView {
    pub app_id: String,
    pub name: String,
    pub status: String,
    pub can_force: bool,
}
impl Session {
    pub fn update(&mut self, processes: &[Process], windows: &[Window], now: u64) -> bool {
        let live: HashMap<_, _> = processes.iter().map(|p| (p.key.pid, p)).collect();
        // Retain lineage for vanished bootstrap processes, but never follow a reused PID.
        loop {
            let mut grew = false;
            for p in processes {
                let parent = self
                    .known
                    .iter()
                    .find(|k| {
                        k.pid == p.parent
                            && k.born <= p.key.born
                            && live.get(&k.pid).is_none_or(|l| l.key == **k)
                    })
                    .copied();
                let path_match = self
                    .expected_path
                    .as_ref()
                    .is_some_and(|path| p.path.eq_ignore_ascii_case(path));
                if (parent.is_some() || path_match) && self.known.insert(p.key) {
                    if parent.is_some_and(|k| self.owned.contains(&k))
                        && !self.baseline.contains(&p.key)
                    {
                        self.owned.insert(p.key);
                    }
                    grew = true;
                }
            }
            if !grew {
                break;
            }
        }
        self.windows = windows
            .iter()
            .filter(|w| self.known.contains(&w.process))
            .cloned()
            .collect();
        if !self.windows.is_empty() {
            self.seen_window = true;
            self.last_seen = now;
            return false;
        }
        if self.untracked {
            return false;
        }
        // Tray helpers may outlive the app window; disappearance of its last window is the daily-use close signal.
        if self.seen_window {
            return now.saturating_sub(self.last_seen) > 1800;
        }
        let alive = self
            .known
            .iter()
            .any(|k| live.get(&k.pid).is_some_and(|p| p.key == *k));
        if now.saturating_sub(self.launched_at) > 20000 {
            if !alive {
                return true;
            }
            self.untracked = true; // No visible window: do not pretend lifecycle detection succeeded.
        }
        false
    }
    pub fn view(&self, now: u64) -> SessionView {
        SessionView {
            app_id: self.app_id.clone(),
            name: self.name.clone(),
            status: if self.closing_at.is_some() {
                "closing"
            } else if self.untracked {
                "untracked"
            } else if self.seen_window {
                "running"
            } else {
                "starting"
            }
            .into(),
            can_force: self
                .closing_at
                .is_some_and(|at| now.saturating_sub(at) > 5000)
                && self.windows.iter().any(|w| self.owned.contains(&w.process))
                && !self.untracked,
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn p(pid: u32, parent: u32, born: u64) -> Process {
        Process {
            key: ProcessKey { pid, born },
            parent,
            path: format!("C:\\{pid}.exe"),
        }
    }
    fn session() -> Session {
        Session {
            app_id: "x".into(),
            name: "X".into(),
            known: HashSet::from([p(1, 0, 1).key]),
            owned: HashSet::from([p(1, 0, 1).key]),
            windows: vec![],
            baseline: HashSet::new(),
            expected_path: None,
            launched_at: 0,
            last_seen: 0,
            seen_window: false,
            untracked: false,
            closing_at: None,
        }
    }
    #[test]
    fn child_outlives_root_and_window_close_returns() {
        let mut s = session();
        let child = p(2, 1, 2);
        let win = Window {
            handle: 1,
            process: child.key,
        };
        assert!(!s.update(
            std::slice::from_ref(&child),
            std::slice::from_ref(&win),
            500
        ));
        assert!(!s.update(std::slice::from_ref(&child), &[win], 900));
        assert!(!s.update(std::slice::from_ref(&child), &[], 2000));
        assert!(s.update(&[child], &[], 2801));
    }
    #[test]
    fn pid_reuse_cannot_adopt_unrelated_child() {
        let mut s = session();
        s.update(&[p(1, 0, 99), p(2, 1, 100)], &[], 1000);
        assert!(!s.known.contains(&p(2, 1, 100).key));
    }
    #[test]
    fn handoff_to_existing_exact_path_is_not_owned() {
        let mut s = session();
        let existing = p(9, 0, 1);
        s.expected_path = Some(existing.path.clone());
        s.baseline.insert(existing.key);
        s.update(std::slice::from_ref(&existing), &[], 1000);
        assert!(s.known.contains(&existing.key));
        assert!(!s.owned.contains(&existing.key));
    }
    #[test]
    fn forced_close_requires_our_live_window_and_a_grace_period() {
        let mut s = session();
        let child = p(2, 1, 2);
        let w = Window {
            handle: 10,
            process: child.key,
        };
        s.update(std::slice::from_ref(&child), std::slice::from_ref(&w), 100);
        assert!(s.owned.contains(&child.key));
        s.closing_at = Some(100);
        assert!(!s.view(1000).can_force);
        assert!(s.view(5200).can_force);
        s.untracked = true;
        assert!(!s.view(6000).can_force);
    }
    #[test]
    fn matching_path_does_not_grant_kill_ownership() {
        let mut s = session();
        let other = p(42, 0, 10);
        s.expected_path = Some(other.path.clone());
        s.update(
            std::slice::from_ref(&other),
            &[Window {
                handle: 42,
                process: other.key,
            }],
            500,
        );
        assert!(s.known.contains(&other.key));
        assert!(!s.owned.contains(&other.key));
        s.closing_at = Some(500);
        assert!(!s.view(6000).can_force);
    }
}
