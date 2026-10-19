pub mod apple_remote;
#[cfg(feature = "desktop")]
mod apple_remote_desktop;
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
pub mod update_flow;
#[cfg(feature = "desktop")]
mod xbox_home;
#[cfg(feature = "desktop")]
pub use runtime::run;
