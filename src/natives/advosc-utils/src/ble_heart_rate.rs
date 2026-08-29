//! BLE Heart Rate sidecar.
//!
//! Speaks the standard Bluetooth Heart Rate Profile (service `0x180D`), so any band or
//! chest strap that implements it works without a vendor handshake. Reads newline
//! delimited JSON commands on stdin and writes newline delimited JSON events on stdout;
//! the Electron main process owns the lifetime of this process.

use btleplug::api::{bleuuid::uuid_from_u16, Central, Manager as _, Peripheral as _, ScanFilter};
use btleplug::platform::{Adapter, Manager, Peripheral};
use futures::stream::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Write;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::io::AsyncBufReadExt;
use tokio::sync::{watch, Mutex};
use uuid::Uuid;

fn hr_service() -> Uuid {
    uuid_from_u16(0x180D)
}
fn hr_measurement() -> Uuid {
    uuid_from_u16(0x2A37)
}
fn body_sensor_location() -> Uuid {
    uuid_from_u16(0x2A38)
}
fn battery_level() -> Uuid {
    uuid_from_u16(0x2A19)
}

/// How long to wait for a target address to show up in scan results before giving up on
/// this attempt and letting the reconnect backoff take over.
const DISCOVER_TIMEOUT: Duration = Duration::from_secs(30);
/// Battery is a plain read on most devices, so poll it instead of subscribing.
const BATTERY_POLL: Duration = Duration::from_secs(300);
/// How often the connection is checked while no notification has arrived.
const HEALTH_POLL: Duration = Duration::from_secs(5);

// ------------------------------------------------------------------ protocol

#[derive(Deserialize)]
#[serde(tag = "cmd", rename_all = "snake_case")]
enum Command {
    /// Report every device seen for `seconds`, then stop.
    Scan {
        #[serde(default)]
        seconds: Option<u64>,
        /// Include devices that do not advertise the heart rate service.
        #[serde(default)]
        all: bool,
    },
    StopScan,
    Connect {
        address: String,
    },
    Disconnect {
        address: String,
    },
    Quit,
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Event {
    Ready {
        adapter: String,
    },
    ScanStarted,
    ScanStopped,
    ScanResult {
        address: String,
        name: Option<String>,
        rssi: Option<i16>,
        /// Whether the advertisement listed the `0x180D` heart rate service.
        hr_service: bool,
    },
    Connecting {
        address: String,
    },
    Connected {
        address: String,
        name: Option<String>,
        sensor_location: Option<String>,
    },
    Hr {
        address: String,
        bpm: u16,
        contact: Option<bool>,
        #[serde(skip_serializing_if = "Option::is_none")]
        energy_kj: Option<u16>,
        rr_ms: Vec<f64>,
        ts: u64,
    },
    Battery {
        address: String,
        percent: u8,
    },
    Disconnected {
        address: String,
        reason: String,
    },
    Error {
        #[serde(skip_serializing_if = "Option::is_none")]
        address: Option<String>,
        message: String,
    },
}

fn emit(event: &Event) {
    if let Ok(json) = serde_json::to_string(event) {
        let mut out = std::io::stdout().lock();
        let _ = writeln!(out, "{}", json);
        // The parent reads line by line and stdout is a pipe, so flush every event.
        let _ = out.flush();
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// ------------------------------------------------------------------- decoder

struct Measurement {
    bpm: u16,
    contact: Option<bool>,
    energy_kj: Option<u16>,
    rr_ms: Vec<f64>,
}

/// Decodes a `0x2A37` Heart Rate Measurement packet. Variable length, little endian: a
/// flags byte, the BPM as u8 or u16, then optional energy and RR-interval fields.
fn decode_measurement(buf: &[u8]) -> Option<Measurement> {
    if buf.len() < 2 {
        return None;
    }
    let flags = buf[0];
    let uint16_format = flags & 0b0000_0001 != 0;
    let contact_detected = flags & 0b0000_0010 != 0;
    let contact_supported = flags & 0b0000_0100 != 0;
    let has_energy = flags & 0b0000_1000 != 0;
    let has_rr = flags & 0b0001_0000 != 0;

    let mut offset = 1usize;
    let bpm = if uint16_format {
        if buf.len() < offset + 2 {
            return None;
        }
        let value = u16::from_le_bytes([buf[offset], buf[offset + 1]]);
        offset += 2;
        value
    } else {
        let value = buf[offset] as u16;
        offset += 1;
        value
    };

    let mut energy_kj = None;
    if has_energy && buf.len() >= offset + 2 {
        energy_kj = Some(u16::from_le_bytes([buf[offset], buf[offset + 1]]));
        offset += 2;
    }

    let mut rr_ms = Vec::new();
    if has_rr {
        // RR intervals are in 1/1024 second units, oldest first, repeating to the end.
        while offset + 1 < buf.len() {
            let raw = u16::from_le_bytes([buf[offset], buf[offset + 1]]) as f64;
            rr_ms.push(raw * 1000.0 / 1024.0);
            offset += 2;
        }
    }

    Some(Measurement {
        bpm,
        contact: if contact_supported {
            Some(contact_detected)
        } else {
            None
        },
        energy_kj,
        rr_ms,
    })
}

fn sensor_location_name(code: u8) -> &'static str {
    match code {
        0 => "Other",
        1 => "Chest",
        2 => "Wrist",
        3 => "Finger",
        4 => "Hand",
        5 => "Ear Lobe",
        6 => "Foot",
        _ => "Unknown",
    }
}

// ---------------------------------------------------------------- scan state

/// Scanning is a single adapter-wide switch, so it is reference counted: every reconnect
/// loop looking for its device holds a slot, and so does an explicit scan command.
#[derive(Clone)]
struct ScanControl {
    adapter: Adapter,
    holders: Arc<Mutex<usize>>,
}

impl ScanControl {
    async fn acquire(&self) {
        let mut holders = self.holders.lock().await;
        if *holders == 0 {
            if let Err(e) = self.adapter.start_scan(ScanFilter::default()).await {
                emit(&Event::Error {
                    address: None,
                    message: format!("scan_failed: {e}"),
                });
            }
        }
        *holders += 1;
    }

    async fn release(&self) {
        let mut holders = self.holders.lock().await;
        *holders = holders.saturating_sub(1);
        if *holders == 0 {
            let _ = self.adapter.stop_scan().await;
        }
    }
}

async fn find_peripheral(adapter: &Adapter, address: &str) -> Option<Peripheral> {
    let peripherals = adapter.peripherals().await.ok()?;
    peripherals
        .into_iter()
        .find(|p| p.address().to_string().eq_ignore_ascii_case(address))
}

// -------------------------------------------------------------- device loops

/// One reconnect loop per requested address. Bands drop constantly (the Xiaomi ones stop
/// broadcasting whenever the screen sleeps), so this retries with backoff until the
/// address is dropped or the process exits.
async fn device_loop(scan: ScanControl, address: String, mut cancel: watch::Receiver<bool>) {
    let mut attempt: u32 = 0;

    loop {
        if *cancel.borrow() {
            break;
        }

        emit(&Event::Connecting {
            address: address.clone(),
        });

        match connect_once(&scan, &address, &mut cancel).await {
            Ok(reason) => {
                emit(&Event::Disconnected {
                    address: address.clone(),
                    reason,
                });
                attempt = 0;
            }
            Err(message) => {
                emit(&Event::Error {
                    address: Some(address.clone()),
                    message,
                });
                attempt = attempt.saturating_add(1);
            }
        }

        if *cancel.borrow() {
            break;
        }

        let delay = Duration::from_secs(2u64.saturating_pow(attempt.min(5)).min(30));
        tokio::select! {
            _ = tokio::time::sleep(delay) => {}
            _ = cancel.changed() => {}
        }
    }
}

/// Returns `Ok(reason)` when a healthy connection ended, `Err(message)` when it never got
/// off the ground.
async fn connect_once(
    scan: &ScanControl,
    address: &str,
    cancel: &mut watch::Receiver<bool>,
) -> Result<String, String> {
    // ---- discover
    scan.acquire().await;
    let deadline = tokio::time::Instant::now() + DISCOVER_TIMEOUT;
    let peripheral = loop {
        if *cancel.borrow() {
            scan.release().await;
            return Ok("cancelled".into());
        }
        if let Some(peripheral) = find_peripheral(&scan.adapter, address).await {
            break peripheral;
        }
        if tokio::time::Instant::now() >= deadline {
            scan.release().await;
            return Err("device_not_found".into());
        }
        tokio::select! {
            _ = tokio::time::sleep(Duration::from_millis(700)) => {}
            _ = cancel.changed() => {}
        }
    };
    scan.release().await;

    // ---- connect. No bonding: GATT straight off the scan result.
    if let Err(e) = peripheral.connect().await {
        return Err(format!("connect_failed: {e}"));
    }
    if let Err(e) = peripheral.discover_services().await {
        let _ = peripheral.disconnect().await;
        return Err(format!("discover_failed: {e}"));
    }

    let characteristics = peripheral.characteristics();
    let measurement = characteristics
        .iter()
        .find(|c| c.uuid == hr_measurement())
        .cloned();
    let Some(measurement) = measurement else {
        let _ = peripheral.disconnect().await;
        return Err("no_heart_rate_service".into());
    };

    if let Err(e) = peripheral.subscribe(&measurement).await {
        let _ = peripheral.disconnect().await;
        return Err(format!("subscribe_failed: {e}"));
    }

    let name = peripheral
        .properties()
        .await
        .ok()
        .flatten()
        .and_then(|p| p.local_name);

    // Cosmetic, and plenty of devices omit it.
    let mut sensor_location = None;
    if let Some(location) = characteristics
        .iter()
        .find(|c| c.uuid == body_sensor_location())
    {
        if let Ok(value) = peripheral.read(location).await {
            if let Some(code) = value.first() {
                sensor_location = Some(sensor_location_name(*code).to_string());
            }
        }
    }

    emit(&Event::Connected {
        address: address.to_string(),
        name,
        sensor_location,
    });

    let battery = characteristics
        .iter()
        .find(|c| c.uuid == battery_level())
        .cloned();
    if let Some(battery) = &battery {
        read_battery(&peripheral, battery, address).await;
    }

    // ---- stream
    let notifications = match peripheral.notifications().await {
        Ok(stream) => stream,
        Err(e) => {
            let _ = peripheral.disconnect().await;
            return Err(format!("notify_failed: {e}"));
        }
    };
    tokio::pin!(notifications);

    let mut battery_timer = tokio::time::interval(BATTERY_POLL);
    battery_timer.tick().await; // the first tick is immediate; we already read on connect
    let mut health_timer = tokio::time::interval(HEALTH_POLL);
    health_timer.tick().await;

    let reason = loop {
        tokio::select! {
            item = notifications.next() => {
                let Some(notification) = item else { break "stream_closed".to_string() };
                if notification.uuid != hr_measurement() { continue }
                let Some(measurement) = decode_measurement(&notification.value) else { continue };
                // Devices report 0 when they lose skin contact, and anything outside the
                // human range is noise. Drop both rather than publish a bad reading.
                if measurement.bpm < 20 || measurement.bpm > 250 { continue }
                emit(&Event::Hr {
                    address: address.to_string(),
                    bpm: measurement.bpm,
                    contact: measurement.contact,
                    energy_kj: measurement.energy_kj,
                    rr_ms: measurement.rr_ms,
                    ts: now_ms(),
                });
            }
            _ = battery_timer.tick() => {
                if let Some(battery) = &battery {
                    read_battery(&peripheral, battery, address).await;
                }
            }
            _ = health_timer.tick() => {
                if !peripheral.is_connected().await.unwrap_or(false) {
                    break "peer_closed".to_string();
                }
            }
            _ = cancel.changed() => {
                if *cancel.borrow() { break "cancelled".to_string() }
            }
        }
    };

    let _ = peripheral.unsubscribe(&measurement).await;
    let _ = peripheral.disconnect().await;
    Ok(reason)
}

async fn read_battery(
    peripheral: &Peripheral,
    characteristic: &btleplug::api::Characteristic,
    address: &str,
) {
    if let Ok(value) = peripheral.read(characteristic).await {
        if let Some(percent) = value.first() {
            emit(&Event::Battery {
                address: address.to_string(),
                percent: (*percent).min(100),
            });
        }
    }
}

// -------------------------------------------------------------------- driver

async fn scan_loop(scan: ScanControl, seconds: u64, all: bool, mut cancel: watch::Receiver<bool>) {
    scan.acquire().await;
    emit(&Event::ScanStarted);

    // Peripherals are polled rather than driven off the adapter event stream, so a device
    // that is already known still gets reported, with a fresh RSSI on each pass.
    let deadline = tokio::time::Instant::now() + Duration::from_secs(seconds);
    let mut seen: HashMap<String, (Option<String>, Option<i16>)> = HashMap::new();

    loop {
        if let Ok(peripherals) = scan.adapter.peripherals().await {
            for peripheral in peripherals {
                let Ok(Some(properties)) = peripheral.properties().await else {
                    continue;
                };
                let advertises_hr = properties.services.contains(&hr_service());
                if !advertises_hr && !all {
                    continue;
                }
                let address = properties.address.to_string();
                let entry = (properties.local_name.clone(), properties.rssi);
                if seen.get(&address) == Some(&entry) {
                    continue;
                }
                seen.insert(address.clone(), entry);
                emit(&Event::ScanResult {
                    address,
                    name: properties.local_name,
                    rssi: properties.rssi,
                    hr_service: advertises_hr,
                });
            }
        }

        if tokio::time::Instant::now() >= deadline || *cancel.borrow() {
            break;
        }
        tokio::select! {
            _ = tokio::time::sleep(Duration::from_millis(800)) => {}
            _ = cancel.changed() => {}
        }
    }

    scan.release().await;
    emit(&Event::ScanStopped);
}

pub fn run() {
    let runtime = match tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(e) => {
            emit(&Event::Error {
                address: None,
                message: format!("runtime_failed: {e}"),
            });
            return;
        }
    };
    runtime.block_on(drive());
}

async fn drive() {
    let manager = match Manager::new().await {
        Ok(manager) => manager,
        Err(e) => {
            emit(&Event::Error {
                address: None,
                message: format!("adapter_unavailable: {e}"),
            });
            return;
        }
    };

    let adapter = match manager.adapters().await {
        Ok(adapters) => match adapters.into_iter().next() {
            Some(adapter) => adapter,
            None => {
                emit(&Event::Error {
                    address: None,
                    message: "adapter_unavailable".into(),
                });
                return;
            }
        },
        Err(e) => {
            emit(&Event::Error {
                address: None,
                message: format!("adapter_unavailable: {e}"),
            });
            return;
        }
    };

    emit(&Event::Ready {
        adapter: adapter
            .adapter_info()
            .await
            .unwrap_or_else(|_| "Bluetooth adapter".into()),
    });

    let scan = ScanControl {
        adapter,
        holders: Arc::new(Mutex::new(0)),
    };

    let mut devices: HashMap<String, watch::Sender<bool>> = HashMap::new();
    let mut scan_cancel: Option<watch::Sender<bool>> = None;

    let mut lines = tokio::io::BufReader::new(tokio::io::stdin()).lines();

    while let Ok(Some(line)) = lines.next_line().await {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let command: Command = match serde_json::from_str(line) {
            Ok(command) => command,
            Err(e) => {
                emit(&Event::Error {
                    address: None,
                    message: format!("bad_command: {e}"),
                });
                continue;
            }
        };

        match command {
            Command::Scan { seconds, all } => {
                if let Some(previous) = scan_cancel.take() {
                    let _ = previous.send(true);
                }
                let (tx, rx) = watch::channel(false);
                scan_cancel = Some(tx);
                tokio::spawn(scan_loop(
                    scan.clone(),
                    seconds.unwrap_or(12).clamp(1, 120),
                    all,
                    rx,
                ));
            }
            Command::StopScan => {
                if let Some(previous) = scan_cancel.take() {
                    let _ = previous.send(true);
                }
            }
            Command::Connect { address } => {
                let address = address.trim().to_uppercase();
                if address.is_empty() || devices.contains_key(&address) {
                    continue;
                }
                let (tx, rx) = watch::channel(false);
                devices.insert(address.clone(), tx);
                tokio::spawn(device_loop(scan.clone(), address, rx));
            }
            Command::Disconnect { address } => {
                if let Some(cancel) = devices.remove(&address.trim().to_uppercase()) {
                    let _ = cancel.send(true);
                }
            }
            Command::Quit => break,
        }
    }

    for (_, cancel) in devices.drain() {
        let _ = cancel.send(true);
    }
    if let Some(cancel) = scan_cancel.take() {
        let _ = cancel.send(true);
    }
    // Give the loops a moment to tear their GATT connections down cleanly.
    tokio::time::sleep(Duration::from_millis(300)).await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_uint8_format() {
        let m = decode_measurement(&[0x00, 78]).unwrap();
        assert_eq!(m.bpm, 78);
        assert_eq!(m.contact, None);
        assert!(m.rr_ms.is_empty());
    }

    #[test]
    fn decodes_uint16_format() {
        // flags bit0 set, BPM 300 little endian
        let m = decode_measurement(&[0x01, 0x2C, 0x01]).unwrap();
        assert_eq!(m.bpm, 300);
    }

    #[test]
    fn reports_contact_only_when_supported() {
        // bit2 supported, bit1 detected
        assert_eq!(decode_measurement(&[0b0000_0110, 70]).unwrap().contact, Some(true));
        // supported but not detected
        assert_eq!(decode_measurement(&[0b0000_0100, 70]).unwrap().contact, Some(false));
        // detected bit set without the supported bit is meaningless
        assert_eq!(decode_measurement(&[0b0000_0010, 70]).unwrap().contact, None);
    }

    #[test]
    fn skips_energy_before_reading_rr() {
        // bit3 energy + bit4 RR, uint8 BPM
        let packet = [0b0001_1000, 60, 0xE8, 0x03, 0x00, 0x04];
        let m = decode_measurement(&packet).unwrap();
        assert_eq!(m.bpm, 60);
        assert_eq!(m.energy_kj, Some(1000));
        // 1024 units is exactly one second
        assert_eq!(m.rr_ms.len(), 1);
        assert!((m.rr_ms[0] - 1000.0).abs() < 0.001);
    }

    #[test]
    fn reads_every_rr_interval_in_a_packet() {
        let packet = [0b0001_0000, 60, 0x00, 0x04, 0x00, 0x02];
        let m = decode_measurement(&packet).unwrap();
        assert_eq!(m.rr_ms.len(), 2);
        assert!((m.rr_ms[1] - 500.0).abs() < 0.001);
    }

    #[test]
    fn rejects_short_packets() {
        assert!(decode_measurement(&[]).is_none());
        assert!(decode_measurement(&[0x00]).is_none());
        // uint16 format with only one BPM byte
        assert!(decode_measurement(&[0x01, 0x2C]).is_none());
    }
}
