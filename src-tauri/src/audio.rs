use serde::{Deserialize, Serialize};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioOutput {
    pub id: String,
    pub name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioState {
    pub outputs: Vec<AudioOutput>,
    pub default_id: Option<String>,
    pub volume: Option<u8>,
    pub muted: bool,
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AudioChange {
    Volume { id: String, value: u8 },
    Mute { id: String, value: bool },
    Output { id: String },
}

impl AudioChange {
    pub fn id(&self) -> &str {
        match self {
            Self::Volume { id, .. } | Self::Mute { id, .. } | Self::Output { id } => id,
        }
    }
    pub fn validate(&self) -> Result<(), String> {
        if self.id().is_empty() || self.id().len() > 4096 || self.id().contains('\0') {
            return Err("Sortie audio invalide.".into());
        }
        if matches!(self, Self::Volume { value, .. } if *value > 100) {
            return Err("Le volume doit être compris entre 0 et 100 %.".into());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_invalid_audio_changes() {
        for value in [0, 100] {
            assert!(AudioChange::Volume {
                id: "device".into(),
                value
            }
            .validate()
            .is_ok());
        }
        assert!(AudioChange::Volume {
            id: "device".into(),
            value: 101
        }
        .validate()
        .is_err());
        for id in ["", "device\0other"] {
            assert!(AudioChange::Output { id: id.into() }.validate().is_err());
        }
        assert!(
            serde_json::from_str::<AudioChange>(r#"{"kind":"volume","id":"d","value":-1}"#)
                .is_err()
        );
    }
}
