use crate::{
    model::AppEntry,
    tracking::{Process, ProcessKey, Window},
};
use std::path::Path;
pub fn supported() -> Result<(), String> {
    Err("Les fonctions natives nécessitent Windows 11 x64.".into())
}
pub fn snapshot() -> (Vec<Process>, Vec<Window>) {
    (vec![], vec![])
}
pub fn focus(_: isize) -> bool {
    false
}
pub fn close(_: &Window) -> Result<(), String> {
    supported()
}
pub fn terminate(_: ProcessKey) -> Result<(), String> {
    supported()
}
pub fn launch(_: &AppEntry) -> Result<Option<ProcessKey>, String> {
    supported()?;
    Ok(None)
}
pub fn scan(_: &Path, _: Option<&Path>) -> Result<Vec<AppEntry>, String> {
    supported()?;
    Ok(vec![])
}
pub fn power(_: &str) -> Result<(), String> {
    supported()
}
pub fn start_controller(_: tauri::AppHandle) {}
pub fn open_game_bar_settings() -> Result<(), String> {
    supported()
}

pub fn desktop() -> Result<(), String> {
    supported()
}

pub fn audio_state() -> Result<crate::audio::AudioState, String> {
    Err("Les commandes audio nécessitent Windows 11.".into())
}
pub fn change_audio(_: crate::audio::AudioChange) -> Result<crate::audio::AudioState, String> {
    audio_state()
}
