use openvr::TrackedDeviceClass;
use std::mem;

use crate::TrackerBattery;

fn device_class_to_string(class: TrackedDeviceClass) -> String {
    match class {
        TrackedDeviceClass::HMD => "HMD".to_string(),
        TrackedDeviceClass::Controller => "Controller".to_string(),
        TrackedDeviceClass::GenericTracker => "Tracker".to_string(),
        TrackedDeviceClass::TrackingReference => "TrackingReference".to_string(),
        TrackedDeviceClass::DisplayRedirect => "DisplayRedirect".to_string(),
        _ => "Unknown".to_string(),
    }
}

/// Check if vrserver.exe (SteamVR) is running
fn is_steamvr_running() -> bool {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::ProcessStatus::{EnumProcesses, GetModuleBaseNameW};
    use windows::Win32::System::Threading::{
        OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ,
    };

    unsafe {
        let mut process_ids: [u32; 4096] = [0; 4096];
        let mut bytes_returned: u32 = 0;

        if EnumProcesses(
            process_ids.as_mut_ptr(),
            (process_ids.len() * mem::size_of::<u32>()) as u32,
            &mut bytes_returned,
        )
        .is_err()
        {
            return false;
        }

        let num_processes = bytes_returned as usize / mem::size_of::<u32>();

        for i in 0..num_processes {
            let pid = process_ids[i];
            if pid == 0 {
                continue;
            }

            let process_handle =
                match OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid) {
                    Ok(h) if !h.is_invalid() => h,
                    _ => continue,
                };

            let mut name_buffer: [u16; 260] = [0; 260];
            let len = GetModuleBaseNameW(process_handle, None, &mut name_buffer);

            if len > 0 {
                let name = OsString::from_wide(&name_buffer[..len as usize])
                    .to_string_lossy()
                    .to_lowercase();

                let _ = CloseHandle(process_handle);

                if name == "vrserver.exe" {
                    return true;
                }
            } else {
                let _ = CloseHandle(process_handle);
            }
        }
        false
    }
}

/// Get battery levels of all tracked devices (trackers, controllers, etc.)
pub fn get_tracker_battery_levels() -> Result<Vec<TrackerBattery>, String> {
    // First check if SteamVR is running
    if !is_steamvr_running() {
        return Err("SteamVR is not running (vrserver.exe not found)".to_string());
    }

    // Initialize OpenVR in utility mode (has access to device properties without requiring HMD)
    let context = match unsafe { openvr::init(openvr::ApplicationType::Utility) } {
        Ok(ctx) => ctx,
        Err(e) => {
            return Err(format!("Failed to initialize OpenVR: {:?}", e));
        }
    };

    let system = match context.system() {
        Ok(sys) => sys,
        Err(e) => {
            return Err(format!("Failed to get OpenVR system: {:?}", e));
        }
    };

    let mut trackers = Vec::new();

    // Iterate through all possible device indices (max 64 in OpenVR)
    for device_index in 0..openvr::MAX_TRACKED_DEVICE_COUNT {
        let device_index_u32 = device_index as u32;
        let device_class = system.tracked_device_class(device_index_u32);

        // Skip invalid devices
        if device_class == TrackedDeviceClass::Invalid {
            continue;
        }

        // We're interested in trackers, controllers, and HMDs that might have batteries
        let is_battery_device = matches!(
            device_class,
            TrackedDeviceClass::GenericTracker
                | TrackedDeviceClass::Controller
                | TrackedDeviceClass::HMD
        );

        if !is_battery_device {
            continue;
        }

        // Check if device provides battery status
        let provides_battery = system
            .bool_tracked_device_property(
                device_index_u32,
                openvr::property::DeviceProvidesBatteryStatus_Bool,
            )
            .unwrap_or(false);

        if !provides_battery {
            continue;
        }

        // Get battery level (0.0 to 1.0)
        let battery_level = system
            .float_tracked_device_property(
                device_index_u32,
                openvr::property::DeviceBatteryPercentage_Float,
            )
            .unwrap_or(0.0);

        // Check if charging
        let is_charging = system
            .bool_tracked_device_property(device_index_u32, openvr::property::DeviceIsCharging_Bool)
            .unwrap_or(false);

        // Get serial number
        let serial_number = system
            .string_tracked_device_property(device_index_u32, openvr::property::SerialNumber_String)
            .ok()
            .map(|s| s.to_string_lossy().into_owned());

        // Get model number
        let model_number = system
            .string_tracked_device_property(device_index_u32, openvr::property::ModelNumber_String)
            .ok()
            .map(|s| s.to_string_lossy().into_owned());

        trackers.push(TrackerBattery {
            device_index: device_index_u32,
            serial_number,
            model_number,
            battery_level,
            is_charging,
            device_class: device_class_to_string(device_class),
        });
    }

    Ok(trackers)
}
