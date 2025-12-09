use clap::{Parser, Subcommand};
use serde::Serialize;
use std::panic;

mod openvr_trackers;
mod process_start_time;

#[derive(Parser)]
#[command(name = "advosc-utils")]
#[command(about = "Native utilities for ADVOSC - VRChat OSC tools")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Get the start time of a process in Unix timestamp (milliseconds)
    #[command(name = "start-time")]
    StartTime {
        /// Name of the process (e.g., "VRChat" or "VRChat.exe")
        process_name: String,
    },
    /// Get battery levels of all OpenVR trackers (requires SteamVR to be running)
    #[command(name = "openvr-trackers")]
    OpenVRTrackers,
}

#[derive(Serialize)]
struct StartTimeResponse {
    start_time: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Serialize)]
struct TrackerBattery {
    device_index: u32,
    serial_number: Option<String>,
    model_number: Option<String>,
    battery_level: f32,
    is_charging: bool,
    device_class: String,
}

#[derive(Serialize)]
struct TrackerBatteryResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    trackers: Option<Vec<TrackerBattery>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

fn main() {
    // Set up panic hook to output JSON errors
    panic::set_hook(Box::new(|info| {
        let error_msg = if let Some(s) = info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "Unknown panic".to_string()
        };
        eprintln!(
            "{{\"error\":\"{}\"}}",
            error_msg.replace('"', "\\\"").replace('\n', " ")
        );
    }));

    let cli = Cli::parse();

    match cli.command {
        Commands::StartTime { process_name } => {
            let response = match process_start_time::get_process_start_time(&process_name) {
                Ok(start_time) => StartTimeResponse {
                    start_time: Some(start_time),
                    error: None,
                },
                Err(e) => StartTimeResponse {
                    start_time: None,
                    error: Some(e),
                },
            };
            println!("{}", serde_json::to_string(&response).unwrap());
        }
        Commands::OpenVRTrackers => {
            let response = match openvr_trackers::get_tracker_battery_levels() {
                Ok(trackers) => TrackerBatteryResponse {
                    trackers: Some(trackers),
                    error: None,
                },
                Err(e) => TrackerBatteryResponse {
                    trackers: None,
                    error: Some(e),
                },
            };
            println!("{}", serde_json::to_string(&response).unwrap());
        }
    }
}
