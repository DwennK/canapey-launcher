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
        assert!(s.load().1.is_none());
        let mut c = Config::default();
        s.save(&c).unwrap();
        c.settings.sound = true;
        s.save(&c).unwrap();
        assert!(s.load().0.settings.sound);
        fs::write(d.path().join("config.json"), "{bad").unwrap();
        let (r, w) = s.load();
        assert!(w.is_some());
        assert!(!r.settings.sound);
        assert!(fs::read_dir(d.path()).unwrap().any(|e| e
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with("config.invalid")));
    }
}
