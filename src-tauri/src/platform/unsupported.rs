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

pub fn desktop() -> Result<(), String> {
    supported()
}
