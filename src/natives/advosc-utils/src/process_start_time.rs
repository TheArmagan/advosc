use std::ffi::OsString;
use std::mem;
use std::os::windows::ffi::OsStringExt;
use windows::Win32::Foundation::{CloseHandle, FILETIME};
use windows::Win32::System::ProcessStatus::{EnumProcesses, GetModuleBaseNameW};
use windows::Win32::System::Threading::{
    GetProcessTimes, OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ,
};

/// Convert Windows FILETIME to Unix timestamp in milliseconds
fn filetime_to_unix_ms(ft: &FILETIME) -> u64 {
    // FILETIME is 100-nanosecond intervals since January 1, 1601
    // Unix timestamp is milliseconds since January 1, 1970
    let ft_value = ((ft.dwHighDateTime as u64) << 32) | (ft.dwLowDateTime as u64);

    // Difference between 1601 and 1970 in 100-nanosecond intervals
    const EPOCH_DIFF: u64 = 116444736000000000;

    if ft_value < EPOCH_DIFF {
        return 0;
    }

    // Convert to milliseconds
    (ft_value - EPOCH_DIFF) / 10000
}

/// Get process start time by name, returns Unix timestamp in milliseconds
pub fn get_process_start_time(process_name: &str) -> Result<u64, String> {
    let search_name = if process_name.to_lowercase().ends_with(".exe") {
        process_name.to_lowercase()
    } else {
        format!("{}.exe", process_name.to_lowercase())
    };

    unsafe {
        // Get list of all process IDs
        let mut process_ids: [u32; 4096] = [0; 4096];
        let mut bytes_returned: u32 = 0;

        EnumProcesses(
            process_ids.as_mut_ptr(),
            (process_ids.len() * mem::size_of::<u32>()) as u32,
            &mut bytes_returned,
        )
        .map_err(|e| format!("Failed to enumerate processes: {}", e))?;

        let num_processes = bytes_returned as usize / mem::size_of::<u32>();

        for i in 0..num_processes {
            let pid = process_ids[i];
            if pid == 0 {
                continue;
            }

            // Try to open the process
            let process_handle =
                match OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid) {
                    Ok(h) => h,
                    Err(_) => continue,
                };

            if process_handle.is_invalid() {
                continue;
            }

            // Get process name
            let mut name_buffer: [u16; 260] = [0; 260];
            let len = GetModuleBaseNameW(process_handle, None, &mut name_buffer);

            if len > 0 {
                let name = OsString::from_wide(&name_buffer[..len as usize])
                    .to_string_lossy()
                    .to_lowercase();

                if name == search_name {
                    // Get process times
                    let mut creation_time: FILETIME = mem::zeroed();
                    let mut exit_time: FILETIME = mem::zeroed();
                    let mut kernel_time: FILETIME = mem::zeroed();
                    let mut user_time: FILETIME = mem::zeroed();

                    if GetProcessTimes(
                        process_handle,
                        &mut creation_time,
                        &mut exit_time,
                        &mut kernel_time,
                        &mut user_time,
                    )
                    .is_ok()
                    {
                        let _ = CloseHandle(process_handle);
                        return Ok(filetime_to_unix_ms(&creation_time));
                    }
                }
            }

            let _ = CloseHandle(process_handle);
        }

        Err(format!("Process '{}' not found", process_name))
    }
}
