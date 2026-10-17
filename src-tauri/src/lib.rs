pub mod audio;
pub mod config;
pub mod home_shortcut;
pub mod input;
pub mod model;
#[cfg(feature = "desktop")]
mod platform;
#[cfg(feature = "desktop")]
mod remote_home;
pub mod remote_shortcut;
#[cfg(feature = "desktop")]
mod runtime;
pub mod tracking;
#[cfg(feature = "desktop")]
mod xbox_home;
#[cfg(feature = "desktop")]
pub use runtime::run;
