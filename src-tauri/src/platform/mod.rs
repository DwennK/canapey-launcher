#[cfg(windows)]
mod windows;
#[cfg(windows)]
mod xbox;
#[cfg(windows)]
pub use windows::*;
#[cfg(windows)]
pub(crate) use xbox::XboxInput;
#[cfg(not(windows))]
mod unsupported;
#[cfg(not(windows))]
pub use unsupported::*;

#[cfg(windows)]
mod audio;
#[cfg(windows)]
pub use audio::{audio_state, change_audio};
