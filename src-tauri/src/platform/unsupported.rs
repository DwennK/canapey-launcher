use crate::{
    model::AppEntry,
    tracking::{Process, ProcessKey, Window},
};
use std::path::Path;
pub fn supported() -> Result<(), String> {
    Err("Native features require Windows 11 x64.".into())
}
pub fn snapshot() -> (Vec<Process>, Vec<Window>) {
    (vec![], vec![])
}
pub fn focus(_: isize) -> bool {
    false
}
pub fn focus_app(_: &Window) -> bool {
    false
}
pub fn maximize(_: &Window) -> bool {
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

pub fn task_view() -> Result<(), String> {
    supported()
}

pub fn escape() -> Result<(), String> {
    supported()
}

pub fn close_foreground_window() -> Result<(), String> {
    supported()
}

pub fn audio_state() -> Result<crate::audio::AudioState, String> {
    Err("Audio controls require Windows 11.".into())
}
pub fn change_audio(_: crate::audio::AudioChange) -> Result<crate::audio::AudioState, String> {
    audio_state()
}

pub fn media_command(_: &str) -> Result<(), String> {
    supported()
}
