//! Device lookup and stream opening. rodio takes a `cpal::Device`, so choosing a device is
//! cpal's job and everything after that is rodio's.

use cpal::traits::{DeviceTrait, HostTrait};
use rodio::{DeviceSinkBuilder, MixerDeviceSink};

use crate::protocol::DeviceInfo;

pub struct OpenedOutput {
    pub sink: MixerDeviceSink,
    pub id: Option<String>,
    pub name: String,
    pub sample_rate: u32,
    pub channels: u16,
}

pub fn device_id(device: &cpal::Device) -> Option<String> {
    device.id().ok().map(|id| id.to_string())
}

pub fn device_name(device: &cpal::Device) -> String {
    device
        .description()
        .map(|description| description.name().to_string())
        .unwrap_or_else(|_| "Unknown device".to_string())
}

/// cpal unwraps a few COM calls that can fail while a device is being pulled. That shouldn't
/// be able to take down every other sound, so those failures read as "device not there".
fn guarded<T>(call: impl FnOnce() -> T) -> Option<T> {
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(call)).ok()
}

/// Device ids to pretend are unplugged, or "*" for all of them. Windows has no way to script
/// pulling a device, so this stands in for it when testing the lost and restored paths.
#[cfg(feature = "test-hooks")]
pub static HIDDEN_DEVICE: std::sync::Mutex<String> = std::sync::Mutex::new(String::new());

#[cfg(feature = "test-hooks")]
fn is_hidden(id: Option<&str>) -> bool {
    let hidden = HIDDEN_DEVICE.lock().unwrap();
    *hidden == "*" || (!hidden.is_empty() && id == Some(hidden.as_str()))
}

#[cfg(not(feature = "test-hooks"))]
fn is_hidden(_id: Option<&str>) -> bool {
    false
}

pub fn default_device() -> Option<cpal::Device> {
    guarded(|| cpal::default_host().default_output_device())
        .flatten()
        .filter(|device| !is_hidden(device_id(device).as_deref()))
}

pub fn default_device_id() -> Option<String> {
    guarded(|| default_device().and_then(|device| device_id(&device))).flatten()
}

pub fn find_device(id: &str) -> Option<cpal::Device> {
    if is_hidden(Some(id)) {
        return None;
    }
    guarded(|| {
        cpal::default_host()
            .output_devices()
            .ok()?
            .find(|device| device_id(device).as_deref() == Some(id))
    })
    .flatten()
}

pub fn list_devices() -> Vec<DeviceInfo> {
    let default_id = default_device_id();
    guarded(|| {
        let Ok(devices) = cpal::default_host().output_devices() else {
            return Vec::new();
        };
        devices
            .filter_map(|device| {
                let id = device_id(&device)?;
                Some(DeviceInfo {
                    is_default: default_id.as_deref() == Some(&id),
                    name: device_name(&device),
                    id,
                })
            })
            .collect()
    })
    .unwrap_or_default()
}

pub fn open(
    device: cpal::Device,
    on_error: impl FnMut(cpal::Error) + Send + Clone + 'static,
) -> Result<OpenedOutput, String> {
    let id = device_id(&device);
    let name = device_name(&device);

    let builder = DeviceSinkBuilder::from_device(device)
        .map_err(|e| e.to_string())?
        .with_error_callback(on_error);
    let mut sink = builder.open_sink_or_fallback().map_err(|e| e.to_string())?;
    sink.log_on_drop(false);

    let config = *sink.config();
    Ok(OpenedOutput {
        sink,
        id,
        name,
        sample_rate: config.sample_rate().get(),
        channels: config.channel_count().get(),
    })
}
