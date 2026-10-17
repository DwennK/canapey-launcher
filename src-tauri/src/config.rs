use crate::model::Config;
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
pub struct ConfigStore {
    pub dir: PathBuf,
}
impl ConfigStore {
    pub fn new(dir: PathBuf) -> Self {
        Self { dir }
    }
    pub fn load(&self) -> (Config, Option<String>) {
        let p = self.dir.join("config.json");
        if !p.exists() {
            return (Config::default(), None);
        }
        if let Ok(c) = Self::read(&p) {
            return (c, None);
        }
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        let _ = fs::rename(&p, self.dir.join(format!("config.invalid-{stamp}.json")));
        let restored = Self::read(&self.dir.join("config.backup.json")).unwrap_or_default();
        (restored,Some("Configuration endommagée : sauvegarde récupérée, ou réglages par défaut. L’original est conservé.".into()))
    }
    fn read(p: &Path) -> Result<Config, String> {
        let meta = fs::metadata(p).map_err(|e| e.to_string())?;
        if meta.len() > 2_000_000 {
            return Err("Configuration trop volumineuse".into());
        }
        let mut c: Config = serde_json::from_slice(&fs::read(p).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        c.settings.migrate_remote();
        c.validate()?;
        if !c.apps.iter().any(|a| Some(&a.id) == c.selected_id.as_ref()) {
            c.selected_id = c.apps.first().map(|a| a.id.clone());
        }
        Ok(c)
    }
    pub fn save(&self, c: &Config) -> Result<(), String> {
        c.validate()?;
        fs::create_dir_all(&self.dir).map_err(|e| e.to_string())?;
        let p = self.dir.join("config.json");
        if let Ok(old) = Self::read(&p) {
            self.atomic(
                "config.backup.json",
                &serde_json::to_vec_pretty(&old).map_err(|e| e.to_string())?,
            )?;
        }
        self.atomic(
            "config.json",
            &serde_json::to_vec_pretty(c).map_err(|e| e.to_string())?,
        )
    }
    fn atomic(&self, name: &str, bytes: &[u8]) -> Result<(), String> {
        let mut tmp = tempfile::NamedTempFile::new_in(&self.dir).map_err(|e| e.to_string())?;
        tmp.write_all(bytes)
            .and_then(|_| tmp.as_file().sync_all())
            .map_err(|e| e.to_string())?;
        tmp.persist(self.dir.join(name))
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{AppEntry, Target, TargetKind};
    #[test]
    fn ambiance_defaults_migrate_and_custom_settings_survive_reload() {
        let d = tempfile::tempdir().unwrap();
        let store = ConfigStore::new(d.path().into());
        let mut legacy = serde_json::to_value(Config::default()).unwrap();
        let settings = legacy["settings"].as_object_mut().unwrap();
        for key in [
            "soundVolume",
            "dynamicBackground",
            "generalAmbiance",
            "backgroundBrightness",
            "backgroundBlur",
        ] {
            settings.remove(key);
        }
        settings.insert("sound".into(), false.into());
        fs::write(
            d.path().join("config.json"),
            serde_json::to_vec(&legacy).unwrap(),
        )
        .unwrap();
        let (mut config, warning) = store.load();
        assert!(warning.is_none());
        assert!(!config.settings.sound);
        assert_eq!(config.settings.sound_volume, 0.5);
        assert!(config.settings.dynamic_background);
        assert_eq!(config.settings.general_ambiance, "home");
        assert_eq!(config.settings.background_brightness, 1.0);
        assert_eq!(config.settings.background_blur, 0.0);
        config.settings.sound_volume = 0.25;
        config.settings.dynamic_background = false;
        config.settings.general_ambiance = "night".into();
        config.settings.background_brightness = 0.65;
        config.settings.background_blur = 8.0;
        store.save(&config).unwrap();
        let (loaded, warning) = store.load();
        assert!(warning.is_none());
        assert_eq!(
            serde_json::to_value(loaded).unwrap(),
            serde_json::to_value(config).unwrap()
        );
    }
    #[test]
    fn invalid_ambiance_settings_do_not_replace_saved_config() {
        let d = tempfile::tempdir().unwrap();
        let store = ConfigStore::new(d.path().into());
        let original = Config::default();
        store.save(&original).unwrap();
        let mut invalid_theme = original.clone();
        invalid_theme.settings.general_ambiance = "unknown".into();
        assert!(store.save(&invalid_theme).is_err());
        for (field, value) in [
            ("soundVolume", 1.1),
            ("backgroundBrightness", 0.0),
            ("backgroundBlur", 13.0),
        ] {
            let mut invalid = serde_json::to_value(&original).unwrap();
            invalid["settings"][field] = value.into();
            let config: Config = serde_json::from_value(invalid).unwrap();
            assert!(store.save(&config).is_err());
        }
        assert_eq!(
            serde_json::to_value(store.load().0).unwrap(),
            serde_json::to_value(original).unwrap()
        );
    }
    #[test]
    fn spotify_and_internet_survive_config_reload() {
        let d = tempfile::tempdir().unwrap();
        let store = ConfigStore::new(d.path().into());
        let mut config = Config::default();
        for (name, theme, url) in [
            ("Spotify", "spotify", "https://open.spotify.com/"),
            ("Internet", "internet", "https://www.google.com/"),
        ] {
            config.apps.push(AppEntry {
                id: theme.into(),
                name: name.into(),
                theme: theme.into(),
                target: Target {
                    kind: TargetKind::Uri,
                    value: url.into(),
                    args: vec![],
                    working_dir: None,
                },
                card: None,
                background: None,
                icon: None,
                source: "Raccourci web explicite".into(),
            });
        }
        config.selected_id = Some("internet".into());
        store.save(&config).unwrap();
        let (loaded, warning) = store.load();
        assert!(warning.is_none());
        assert_eq!(
            serde_json::to_value(loaded).unwrap(),
            serde_json::to_value(config).unwrap()
        );
    }
    #[test]
    fn absent_corrupt_backup_atomic() {
        let d = tempfile::tempdir().unwrap();
        let s = ConfigStore::new(d.path().into());
        let (initial, warning) = s.load();
        assert!(warning.is_none());
        assert!(initial.settings.sound);
        let mut c = Config::default();
        s.save(&c).unwrap();
        c.settings.sound = false;
        s.save(&c).unwrap();
        assert!(!s.load().0.settings.sound);
        fs::write(d.path().join("config.json"), "{bad").unwrap();
        let (r, w) = s.load();
        assert!(w.is_some());
        assert!(r.settings.sound);
        assert!(fs::read_dir(d.path()).unwrap().any(|e| e
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with("config.invalid")));
    }
}
