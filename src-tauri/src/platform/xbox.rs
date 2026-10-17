//! Optional XInput Guide extension. Only load the Windows system DLL, never a local DLL.
//! Ordinal 100 is undocumented but also used by SDL's Windows XInput backend:
//! https://github.com/libsdl-org/SDL/blob/main/src/core/windows/SDL_xinput.c
use windows_sys::Win32::{
    Foundation::{FreeLibrary, HMODULE},
    System::LibraryLoader::{GetProcAddress, LoadLibraryExW, LOAD_LIBRARY_SEARCH_SYSTEM32},
    UI::Input::XboxController::XINPUT_STATE,
};

type GetState = unsafe extern "system" fn(u32, *mut XINPUT_STATE) -> u32;

pub struct XboxInput {
    module: HMODULE,
    read: Option<GetState>,
    pub guide_available: bool,
}

impl XboxInput {
    pub fn new() -> Self {
        // XInput 1.4 ships with supported Windows versions. The handle stays alive
        // for as long as a function pointer can be called.
        unsafe {
            let name: Vec<u16> = "xinput1_4.dll\0".encode_utf16().collect();
            let module = LoadLibraryExW(
                name.as_ptr(),
                std::ptr::null_mut(),
                LOAD_LIBRARY_SEARCH_SYSTEM32,
            );
            let extended = if module.is_null() {
                None
            } else {
                GetProcAddress(module, 100usize as *const u8)
            };
            let read = extended.or_else(|| {
                if module.is_null() {
                    None
                } else {
                    GetProcAddress(module, c"XInputGetState".as_ptr().cast())
                }
            });
            Self {
                module,
                read: read.map(|f| {
                    std::mem::transmute::<unsafe extern "system" fn() -> isize, GetState>(f)
                }),
                guide_available: extended.is_some(),
            }
        }
    }

    pub fn sample(&self) -> [Option<u16>; 4] {
        std::array::from_fn(|slot| {
            let read = self.read?;
            let mut state = XINPUT_STATE::default();
            // Every connected slot is sampled, regardless of packet number or focus.
            (unsafe { read(slot as u32, &mut state) } == 0).then_some(state.Gamepad.wButtons)
        })
    }
}

impl Drop for XboxInput {
    fn drop(&mut self) {
        if !self.module.is_null() {
            unsafe {
                FreeLibrary(self.module);
            }
        }
    }
}
