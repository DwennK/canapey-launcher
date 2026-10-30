use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Target {
    pub kind: TargetKind,
    pub value: String,
    #[serde(default)]
    pub args: Vec<String>,
    pub working_dir: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TargetKind {
    Executable,
    Shortcut,
    Uri,
    Packaged,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppEntry {
    pub id: String,
    pub name: String,
    pub target: Target,
    #[serde(default = "home")]
    pub theme: String,
    pub card: Option<String>,
    pub background: Option<String>,
    pub icon: Option<String>,
    #[serde(default)]
    pub source: String,
}
fn home() -> String {
    "home".into()
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct LibraryPreferences {
    pub favorites: Vec<String>,
    pub categories: HashMap<String, String>,
    pub sort: String,
}
impl Default for LibraryPreferences {
    fn default() -> Self {
        Self {
            favorites: vec![],
            categories: HashMap::new(),
            sort: "custom".into(),
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub locale: Option<String>,
    pub library: LibraryPreferences,
    pub last_settings_tab: String,
    pub fullscreen: bool,
    pub autostart: bool,
    pub monitor: Option<String>,
    pub scale: f64,
    pub motion: bool,
    pub sound: bool,
    pub sound_volume: f64,
    pub dynamic_background: bool,
    pub general_ambiance: String,
    pub background_brightness: f64,
    pub background_blur: f64,
    pub deadzone: f32,
    pub return_shortcut: String,
    pub remote_bindings: Vec<crate::remote_shortcut::RemoteBinding>,
    pub apple_remote: crate::apple_remote::Settings,
    pub remote_home: Option<crate::remote_shortcut::RemoteShortcut>,
    pub hold_ms: u64,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            locale: None,
            library: LibraryPreferences::default(),
            last_settings_tab: "display".into(),
            fullscreen: true,
            autostart: false,
            monitor: None,
            scale: 1.0,
            motion: true,
            sound: true,
            sound_volume: 0.5,
            dynamic_background: true,
            general_ambiance: "home".into(),
            background_brightness: 1.0,
            background_blur: 0.0,
            deadzone: 0.24,
            return_shortcut: "xbox".into(),
            remote_home: None,
            remote_bindings: vec![],
            apple_remote: Default::default(),
            hold_ms: 1200,
        }
    }
}
impl Settings {
    pub fn migrate_remote(&mut self) {
        if let Some(key) = self.remote_home.take() {
            if self.remote_bindings.is_empty() {
                self.remote_bindings
                    .push(crate::remote_shortcut::RemoteBinding {
                        button: "home".into(),
                        key,
                        action: "home".into(),
                        global: true,
                        app_id: None,
                    });
            }
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub version: u32,
    pub apps: Vec<AppEntry>,
    pub selected_id: Option<String>,
    #[serde(default)]
    pub settings: Settings,
}
impl Default for Config {
    fn default() -> Self {
        Self {
            version: 1,
            apps: vec![],
            selected_id: None,
            settings: Settings::default(),
        }
    }
}
fn clean(s: &str, max: usize) -> bool {
    s.len() <= max && !s.contains('\0')
}
impl Target {
    pub fn validate(&self) -> Result<(), String> {
        if self.value.trim().is_empty() || !clean(&self.value, 32768) {
            return Err("Invalid target.".into());
        }
        if self.args.len() > 128
            || self.args.iter().any(|s| !clean(s, 8192))
            || self.working_dir.as_ref().is_some_and(|s| !clean(s, 32768))
        {
            return Err("Invalid arguments.".into());
        }
        match self.kind {
            TargetKind::Uri => {
                let u = url::Url::parse(&self.value).map_err(|_| "Invalid URI.")?;
                // No arbitrary script, file or shell protocols. New protocols require an explicit code review.
                if !["https", "http", "steam", "spotify", "ms-xbox"].contains(&u.scheme()) {
                    return Err(
                        "Protocol not allowed (http, https, steam, spotify, ms-xbox).".into(),
                    );
                }
                if ["http", "https"].contains(&u.scheme())
                    && (u.host_str().is_none()
                        || !u.username().is_empty()
                        || u.password().is_some())
                {
                    return Err("Invalid web address.".into());
                }
                if !self.args.is_empty() {
                    return Err("A URI cannot take separate arguments.".into());
                }
            }
            TargetKind::Packaged => {
                if !self.value.contains('!')
                    || self
                        .value
                        .chars()
                        .any(|c| !c.is_ascii_alphanumeric() && !"._!-".contains(c))
                    || !self.args.is_empty()
                {
                    return Err("Invalid launch identity.".into());
                }
            }
            TargetKind::Executable | TargetKind::Shortcut => {
                let p = self.value.to_lowercase();
                let absolute = p.as_bytes().get(1) == Some(&b':')
                    && matches!(p.as_bytes().get(2), Some(b'\\') | Some(b'/'));
                if !absolute
                    || !(if self.kind == TargetKind::Executable {
                        p.ends_with(".exe")
                    } else {
                        p.ends_with(".lnk")
                    })
                {
                    return Err("Choose an absolute Windows path to an .exe or .lnk file.".into());
                }
                if let Some(dir) = &self.working_dir {
                    if !(dir.is_empty()
                        || (dir.as_bytes().get(1) == Some(&b':')
                            && matches!(dir.as_bytes().get(2), Some(b'\\') | Some(b'/'))))
                    {
                        return Err("Invalid working directory.".into());
                    }
                }
            }
        }
        Ok(())
    }
    pub fn key(&self) -> String {
        // Arguments are part of identity: browser PWAs must not collapse into one executable.
        format!(
            "{:?}|{}|{}|{}",
            self.kind,
            if self.kind == TargetKind::Uri {
                url::Url::parse(&self.value)
                    .map(|u| u.to_string())
                    .unwrap_or(self.value.clone())
            } else {
                self.value.replace('/', "\\").to_lowercase()
            },
            serde_json::to_string(&self.args).unwrap_or_default(),
            self.working_dir.as_deref().unwrap_or("").to_lowercase()
        )
    }
}
impl Config {
    pub fn validate(&self) -> Result<(), String> {
        if self.version != 1 {
            return Err("Unsupported configuration version.".into());
        }
        if self.apps.len() > 250 {
            return Err("Maximum of 250 apps.".into());
        }
        let s = &self.settings;
        if s.locale.as_deref().is_some_and(|value| value != "en") {
            return Err("Unsupported language.".into());
        }
        if s.library.favorites.len() > 250
            || s.library.categories.len() > 250
            || s.library
                .favorites
                .iter()
                .any(|id| id.is_empty() || !clean(id, 100))
            || s.library.categories.iter().any(|(id, category)| {
                id.is_empty()
                    || !clean(id, 100)
                    || !["games", "video", "music", "other"].contains(&category.as_str())
            })
            || !["custom", "name", "category"].contains(&s.library.sort.as_str())
            || ![
                "display",
                "apps",
                "controls",
                "remote",
                "iphone",
                "tv",
                "system",
                "updates",
                "diagnostic",
            ]
            .contains(&s.last_settings_tab.as_str())
        {
            return Err("Invalid library preferences.".into());
        }

        crate::remote_shortcut::validate_bindings(&s.remote_bindings)?;
        s.apple_remote.validate()?;
        if let Some(shortcut) = &s.remote_home {
            shortcut.validate()?;
        }
        if !s.scale.is_finite()
            || !(0.8..=1.4).contains(&s.scale)
            || !(0.0..=1.0).contains(&s.sound_volume)
            || !(0.3..=1.0).contains(&s.background_brightness)
            || !(0.0..=12.0).contains(&s.background_blur)
            || !["home", "spotify", "night", "dusk"].contains(&s.general_ambiance.as_str())
            || !s.deadzone.is_finite()
            || !(0.1..=0.5).contains(&s.deadzone)
            || !(600..=4000).contains(&s.hold_ms)
            || !["xbox", "startBack", "shouldersStart", "disabled"]
                .contains(&s.return_shortcut.as_str())
        {
            return Err("Setting out of range.".into());
        }
        let mut ids = HashSet::new();
        for a in &self.apps {
            if a.id.is_empty()
                || !clean(&a.id, 100)
                || !ids.insert(&a.id)
                || a.name.trim().is_empty()
                || !clean(&a.name, 100)
            {
                return Err("Invalid app name or identifier.".into());
            }
            if ![
                "home", "youtube", "netflix", "spotify", "internet", "plezy", "steam", "silo",
                "windows",
            ]
            .contains(&a.theme.as_str())
            {
                return Err("Unknown theme.".into());
            }
            a.target.validate()?;
        }
        Ok(())
    }
}
pub fn deduplicate(apps: Vec<AppEntry>) -> Vec<AppEntry> {
    let mut seen = HashSet::new();
    let mut out: Vec<_> = apps
        .into_iter()
        .filter(|a| {
            let n = a.name.to_lowercase();
            ![
                "uninstall",
                "désinstaller",
                "desinstaller",
                "unins0",
                "crash reporter",
                "redistributable",
            ]
            .iter()
            .any(|s| n.contains(s))
                && a.target.validate().is_ok()
                && seen.insert(a.target.key())
        })
        .collect();
    out.sort_by_key(|a| a.name.to_lowercase());
    out
}
#[cfg(test)]
mod tests {
    use super::*;
    fn entry(path: &str, args: Vec<String>) -> AppEntry {
        AppEntry {
            id: uuid::Uuid::new_v4().to_string(),
            name: "App".into(),
            target: Target {
                kind: TargetKind::Executable,
                value: path.into(),
                args,
                working_dir: None,
            },
            theme: home(),
            card: None,
            background: None,
            icon: None,
            source: "test".into(),
        }
    }
    #[test]
    fn duplicate_paths_but_distinct_pwas() {
        assert_eq!(
            deduplicate(vec![
                entry("C:\\App.exe", vec![]),
                entry("c:\\APP.exe", vec![]),
                entry("C:\\App.exe", vec!["--app=https://example.com".into()])
            ])
            .len(),
            2
        );
    }
    #[test]
    fn malicious_uri_and_shell_are_rejected() {
        for value in [
            "javascript:alert(1)",
            "file:///C:/Windows/system32/cmd.exe",
            "shell:AppsFolder",
        ] {
            assert!(Target {
                kind: TargetKind::Uri,
                value: value.into(),
                args: vec![],
                working_dir: None
            }
            .validate()
            .is_err());
        }
    }
    #[test]
    fn config_rejects_duplicates_and_bad_version() {
        let mut c = Config::default();
        c.apps.push(entry("C:\\App.exe", vec![]));
        c.apps.push(c.apps[0].clone());
        assert!(c.validate().is_err());
        c.apps.clear();
        c.version = 2;
        assert!(c.validate().is_err());
    }
}
