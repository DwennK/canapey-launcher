use crate::tracking::{Session, Window};
use std::collections::{HashMap, HashSet};

/// Request normal closure once per installation attempt, then wait for confirmed exit.
/// Shared/unidentifiable launches cannot safely be closed and do not block an update.
pub fn close_for_update(
    sessions: &mut HashMap<String, Session>,
    now: u64,
    requested: &mut HashSet<String>,
    mut close: impl FnMut(&Window) -> Result<(), String>,
) -> Result<Vec<String>, String> {
    let mut pending = Vec::new();
    for session in sessions.values_mut().filter(|s| !s.untracked) {
        pending.push(session.name.clone());
        if requested.contains(&session.app_id) || session.windows.is_empty() {
            continue;
        }
        for window in &session.windows {
            close(window).map_err(|e| format!("Could not close {}: {e}", session.name))?;
        }
        session.closing_at = Some(now);
        requested.insert(session.app_id.clone());
    }
    pending.sort();
    Ok(pending)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tracking::ProcessKey;
    use std::collections::HashSet;

    fn session(untracked: bool, windows: bool) -> Session {
        Session {
            app_id: "app".into(),
            name: "Editor".into(),
            known: HashSet::new(),
            owned: HashSet::new(),
            windows: if windows {
                vec![Window {
                    handle: 1,
                    process: ProcessKey { pid: 1, born: 1 },
                }]
            } else {
                vec![]
            },
            maximized_windows: HashSet::new(),
            baseline: HashSet::new(),
            expected_path: None,
            launched_at: 0,
            last_seen: 0,
            seen_window: windows,
            untracked,
            closing_at: None,
        }
    }
    #[test]
    fn requests_normal_close_once_and_waits_for_actual_exit() {
        let mut sessions = HashMap::from([("app".into(), session(false, true))]);
        let mut calls = 0;
        let mut requested = HashSet::new();
        for time in [10, 20, 30] {
            assert_eq!(
                close_for_update(&mut sessions, time, &mut requested, |_| {
                    calls += 1;
                    Ok(())
                })
                .unwrap(),
                ["Editor"]
            );
        }
        assert_eq!(calls, 1);
        assert_eq!(sessions["app"].closing_at, Some(10));
        sessions.clear();
        assert!(
            close_for_update(&mut sessions, 40, &mut HashSet::new(), |_| panic!(
                "already closed"
            ))
            .unwrap()
            .is_empty()
        );
    }
    #[test]
    fn waits_for_starting_apps_but_never_closes_shared_windows() {
        let mut sessions = HashMap::from([
            ("shared".into(), session(true, true)),
            ("starting".into(), session(false, false)),
        ]);
        assert_eq!(
            close_for_update(&mut sessions, 10, &mut HashSet::new(), |_| panic!(
                "not safely closable"
            ))
            .unwrap(),
            ["Editor"]
        );
        sessions.remove("starting");
        assert!(
            close_for_update(&mut sessions, 20, &mut HashSet::new(), |_| panic!("shared"))
                .unwrap()
                .is_empty()
        );
        assert_eq!(sessions.len(), 1);
    }
    #[test]
    fn failed_close_keeps_session_retryable_and_names_the_app() {
        let mut sessions = HashMap::from([("app".into(), session(false, true))]);
        assert!(
            close_for_update(&mut sessions, 10, &mut HashSet::new(), |_| Err(
                "rejected".into()
            ))
            .unwrap_err()
            .contains("Editor")
        );
        assert!(sessions["app"].closing_at.is_none());
        assert!(close_for_update(&mut sessions, 20, &mut HashSet::new(), |_| Ok(())).is_ok());
    }
    #[test]
    fn retry_after_cancelled_save_dialog_requests_close_again() {
        let mut app = session(false, true);
        app.closing_at = Some(10);
        let mut sessions = HashMap::from([("app".into(), app)]);
        let mut calls = 0;
        close_for_update(&mut sessions, 50, &mut HashSet::new(), |_| {
            calls += 1;
            Ok(())
        })
        .unwrap();
        assert_eq!(calls, 1);
        assert_eq!(sessions["app"].closing_at, Some(50));
    }
}
