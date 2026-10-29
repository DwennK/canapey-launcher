//! Core Audio runs on blocking worker threads; COM objects never cross threads.
use crate::audio::{AudioChange, AudioOutput, AudioState};
use std::{ffi::c_void, ptr::null};
use windows::{
    core::{IUnknown, IUnknown_Vtbl, Interface, GUID, HRESULT, PCWSTR, PWSTR},
    Win32::{
        Devices::FunctionDiscovery::PKEY_Device_FriendlyName,
        Media::Audio::{
            eCommunications, eConsole, eMultimedia, eRender, ERole,
            Endpoints::IAudioEndpointVolume, IMMDevice, IMMDeviceEnumerator, MMDeviceEnumerator,
            DEVICE_STATE_ACTIVE,
        },
        System::Com::{
            CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize,
            StructuredStorage::{PropVariantClear, PropVariantToStringAlloc},
            CLSCTX_ALL, COINIT_MULTITHREADED, STGM_READ,
        },
    },
};

type Result<T> = std::result::Result<T, String>;
fn error(e: windows::core::Error) -> String {
    format!("Windows cannot access audio: {e}")
}
struct Com;
impl Com {
    fn init() -> Result<Self> {
        // A balanced S_OK / S_FALSE initialization on this worker thread.
        unsafe {
            CoInitializeEx(None, COINIT_MULTITHREADED)
                .ok()
                .map_err(error)?;
        }
        Ok(Self)
    }
}
impl Drop for Com {
    fn drop(&mut self) {
        unsafe { CoUninitialize() }
    }
}
unsafe fn take_string(value: PWSTR) -> Result<String> {
    let text =
        unsafe { value.to_string() }.map_err(|_| "Unreadable audio output name.".to_string());
    unsafe { CoTaskMemFree(Some(value.0.cast())) };
    text
}
fn device_id(device: &IMMDevice) -> Result<String> {
    unsafe { take_string(device.GetId().map_err(error)?) }
}
fn enumerator() -> Result<IMMDeviceEnumerator> {
    unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).map_err(error) }
}
fn read(enumerator: &IMMDeviceEnumerator) -> Result<AudioState> {
    unsafe {
        let devices = enumerator
            .EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)
            .map_err(error)?;
        let mut outputs = Vec::new();
        for i in 0..devices.GetCount().map_err(error)? {
            let device = devices.Item(i).map_err(error)?;
            let id = device_id(&device)?;
            let name = (|| -> Result<String> {
                let store = device.OpenPropertyStore(STGM_READ).map_err(error)?;
                let mut value = store.GetValue(&PKEY_Device_FriendlyName).map_err(error)?;
                let text = PropVariantToStringAlloc(&value).map_err(error);
                let _ = PropVariantClear(&mut value);
                take_string(text?)
            })()
            .unwrap_or_else(|_| format!("Audio output {}", i + 1));
            outputs.push(AudioOutput { id, name });
        }
        outputs.sort_by(|a, b| a.name.cmp(&b.name).then(a.id.cmp(&b.id)));
        // No endpoint is normal when HDMI / Bluetooth is disconnected.
        let default = enumerator
            .GetDefaultAudioEndpoint(eRender, eMultimedia)
            .ok();
        let (default_id, volume, muted) = if let Some(device) = default {
            let endpoint: IAudioEndpointVolume =
                device.Activate(CLSCTX_ALL, None).map_err(error)?;
            (
                Some(device_id(&device)?),
                Some(
                    (endpoint.GetMasterVolumeLevelScalar().map_err(error)? * 100.0)
                        .round()
                        .clamp(0.0, 100.0) as u8,
                ),
                endpoint.GetMute().map_err(error)?.as_bool(),
            )
        } else {
            (None, None, false)
        };
        Ok(AudioState {
            outputs,
            default_id,
            volume,
            muted,
        })
    }
}

// Windows exposes no documented system-default-output setter. This narrowly
// scoped IPolicyConfig ABI is also used by EarTrumpet. Fail visibly if unavailable.
// ABI reference: https://github.com/File-New-Project/EarTrumpet/blob/master/EarTrumpet/Interop/MMDeviceAPI/IPolicyConfig.cs
#[repr(transparent)]
#[derive(Clone)]
struct PolicyConfig(IUnknown);
#[repr(C)]
struct PolicyConfigVtable {
    base: IUnknown_Vtbl,
    // Ten unused methods precede SetDefaultEndpoint; never invoke these slots.
    unused: [unsafe extern "system" fn(); 10],
    set_default: unsafe extern "system" fn(*mut c_void, PCWSTR, ERole) -> HRESULT,
}
// SAFETY: transparent IUnknown wrapper with the verified IPolicyConfig IID/layout.
unsafe impl Interface for PolicyConfig {
    type Vtable = PolicyConfigVtable;
    const IID: GUID = GUID::from_u128(0xf8679f50_850a_41cf_9c72_430f290290c8);
}
impl PolicyConfig {
    fn set(&self, id: &str, role: ERole) -> Result<()> {
        let wide: Vec<u16> = id.encode_utf16().chain(Some(0)).collect();
        unsafe {
            (self.vtable().set_default)(self.as_raw(), PCWSTR(wide.as_ptr()), role)
                .ok()
                .map_err(error)
        }
    }
}

pub fn audio_state() -> Result<AudioState> {
    let _com = Com::init()?;
    read(&enumerator()?)
}
pub fn change_audio(change: AudioChange) -> Result<AudioState> {
    change.validate()?;
    let _com = Com::init()?;
    let enumerator = enumerator()?;
    let before = read(&enumerator)?;
    if !before.outputs.iter().any(|o| o.id == change.id()) {
        return Err("This audio output is no longer connected. Choose another output.".into());
    }
    if matches!(change, AudioChange::Output { .. }) {
        let policy: PolicyConfig = unsafe {
            CoCreateInstance(
                &GUID::from_u128(0x870af99c_171d_4f9e_af0d_e63df40c2bc9),
                None,
                CLSCTX_ALL,
            )
            .map_err(error)?
        };
        let roles = [eConsole, eMultimedia, eCommunications];
        let previous: Vec<_> = roles
            .iter()
            .map(|role| unsafe {
                enumerator
                    .GetDefaultAudioEndpoint(eRender, *role)
                    .ok()
                    .and_then(|d| device_id(&d).ok())
            })
            .collect();
        for (i, role) in roles.iter().enumerate() {
            if let Err(e) = policy.set(change.id(), *role) {
                // Best effort rollback if Windows only accepts part of the change.
                for j in 0..i {
                    if let Some(id) = &previous[j] {
                        let _ = policy.set(id, roles[j]);
                    }
                }
                return Err(e);
            }
        }
    } else {
        // A stale slider must never alter a newly connected/default device.
        if before.default_id.as_deref() != Some(change.id()) {
            return Err("The audio output changed. Try again with the current output.".into());
        }
        let wide: Vec<u16> = change.id().encode_utf16().chain(Some(0)).collect();
        unsafe {
            let device = enumerator.GetDevice(PCWSTR(wide.as_ptr())).map_err(error)?;
            let endpoint: IAudioEndpointVolume =
                device.Activate(CLSCTX_ALL, None).map_err(error)?;
            match change {
                AudioChange::Volume { value, .. } => endpoint
                    .SetMasterVolumeLevelScalar(f32::from(value) / 100.0, null())
                    .map_err(error)?,
                AudioChange::Mute { value, .. } => {
                    endpoint.SetMute(value, null()).map_err(error)?
                }
                AudioChange::Output { .. } => unreachable!(),
            }
        }
    }
    read(&enumerator)
}
