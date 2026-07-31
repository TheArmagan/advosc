use serde::Serialize;
use std::collections::HashMap;

use nvml_wrapper::Nvml;
use windows::core::Interface;
use windows::Win32::Graphics::Dxgi::{
    CreateDXGIFactory1, IDXGIAdapter3, IDXGIFactory1, DXGI_ADAPTER_DESC1, DXGI_ADAPTER_FLAG,
    DXGI_ADAPTER_FLAG_SOFTWARE, DXGI_MEMORY_SEGMENT_GROUP_LOCAL, DXGI_QUERY_VIDEO_MEMORY_INFO,
};
use windows::Win32::System::Performance::{
    PdhAddEnglishCounterW, PdhCloseQuery, PdhCollectQueryData, PdhGetFormattedCounterArrayW,
    PdhOpenQueryW, PDH_FMT, PDH_FMT_COUNTERVALUE_ITEM_W,
};

const PDH_FMT_DOUBLE: PDH_FMT = PDH_FMT(0x0000_0200);
const PDH_MORE_DATA: u32 = 0x8000_07D2;
const GPU_ENGINE_COUNTER: &str = "\\GPU Engine(*)\\Utilization Percentage";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuInfo {
    pub name: String,
    pub vendor: String,
    /// Overall utilization percentage (0-100), when it can be determined.
    pub usage: Option<f32>,
    pub vram_used: Option<u64>,
    pub vram_total: Option<u64>,
    pub vram_usage: Option<f32>,
    /// Core temperature in celsius (NVIDIA only).
    pub temperature: Option<f32>,
    /// Fan speed percentage (NVIDIA only).
    pub fan_speed: Option<f32>,
    /// Power draw in watts (NVIDIA only).
    pub power: Option<f32>,
    /// Core clock in MHz (NVIDIA only).
    pub core_clock: Option<u32>,
}

struct DxgiAdapter {
    name: String,
    vendor_id: u32,
    luid: i64,
    dedicated_vram: u64,
    used_vram: Option<u64>,
}

fn vendor_name(vendor_id: u32) -> &'static str {
    match vendor_id {
        0x10DE => "NVIDIA",
        0x1002 | 0x1022 => "AMD",
        0x8086 => "Intel",
        0x1414 => "Microsoft",
        _ => "Unknown",
    }
}

fn enumerate_adapters() -> Vec<DxgiAdapter> {
    let mut adapters = Vec::new();

    unsafe {
        let factory: IDXGIFactory1 = match CreateDXGIFactory1() {
            Ok(f) => f,
            Err(_) => return adapters,
        };

        let mut index = 0u32;
        while let Ok(adapter) = factory.EnumAdapters1(index) {
            index += 1;

            let mut desc = DXGI_ADAPTER_DESC1::default();
            if adapter.GetDesc1(&mut desc).is_err() {
                continue;
            }

            // Skip WARP / Basic Render Driver style software adapters.
            if DXGI_ADAPTER_FLAG(desc.Flags as i32) == DXGI_ADAPTER_FLAG_SOFTWARE {
                continue;
            }

            let name = String::from_utf16_lossy(&desc.Description)
                .trim_end_matches('\0')
                .trim()
                .to_string();

            let used_vram = adapter.cast::<IDXGIAdapter3>().ok().and_then(|a3| {
                let mut info = DXGI_QUERY_VIDEO_MEMORY_INFO::default();
                a3.QueryVideoMemoryInfo(0, DXGI_MEMORY_SEGMENT_GROUP_LOCAL, &mut info)
                    .ok()
                    .map(|_| info.CurrentUsage)
            });

            adapters.push(DxgiAdapter {
                name,
                vendor_id: desc.VendorId,
                luid: ((desc.AdapterLuid.HighPart as i64) << 32)
                    | (desc.AdapterLuid.LowPart as i64),
                dedicated_vram: desc.DedicatedVideoMemory as u64,
                used_vram,
            });
        }
    }

    adapters
}

/// Reads the same "GPU Engine" performance counters Task Manager uses, so
/// utilization works for every vendor instead of just NVIDIA.
struct GpuEngineCounter {
    query: isize,
    counter: isize,
}

impl GpuEngineCounter {
    fn new() -> Option<Self> {
        unsafe {
            let mut query: isize = 0;
            if PdhOpenQueryW(None, 0, &mut query) != 0 {
                return None;
            }

            let path: Vec<u16> = GPU_ENGINE_COUNTER
                .encode_utf16()
                .chain(std::iter::once(0))
                .collect();
            let mut counter: isize = 0;
            if PdhAddEnglishCounterW(query, windows::core::PCWSTR(path.as_ptr()), 0, &mut counter)
                != 0
            {
                PdhCloseQuery(query);
                return None;
            }

            // A rate counter needs a baseline sample before it can report anything.
            PdhCollectQueryData(query);

            Some(Self { query, counter })
        }
    }

    /// Utilization per adapter LUID. Engine instances are grouped by engine type
    /// (3D, Copy, VideoDecode, ...) and the busiest type wins, matching Task Manager.
    fn sample(&self) -> HashMap<i64, f32> {
        let mut result = HashMap::new();

        unsafe {
            if PdhCollectQueryData(self.query) != 0 {
                return result;
            }

            let mut buffer_size: u32 = 0;
            let mut item_count: u32 = 0;
            let status = PdhGetFormattedCounterArrayW(
                self.counter,
                PDH_FMT_DOUBLE,
                &mut buffer_size,
                &mut item_count,
                None,
            );
            if status != PDH_MORE_DATA || buffer_size == 0 {
                return result;
            }

            let mut buffer = vec![0u8; buffer_size as usize];
            let status = PdhGetFormattedCounterArrayW(
                self.counter,
                PDH_FMT_DOUBLE,
                &mut buffer_size,
                &mut item_count,
                Some(buffer.as_mut_ptr() as *mut PDH_FMT_COUNTERVALUE_ITEM_W),
            );
            if status != 0 {
                return result;
            }

            let items = std::slice::from_raw_parts(
                buffer.as_ptr() as *const PDH_FMT_COUNTERVALUE_ITEM_W,
                item_count as usize,
            );

            // luid -> engine type -> summed utilization
            let mut grouped: HashMap<i64, HashMap<String, f64>> = HashMap::new();

            for item in items {
                if item.szName.is_null() {
                    continue;
                }
                let name = item.szName.to_string().unwrap_or_default();
                let (Some(luid), Some(engine)) = (parse_luid(&name), parse_engine_type(&name))
                else {
                    continue;
                };
                let value = item.FmtValue.Anonymous.doubleValue;
                if !value.is_finite() {
                    continue;
                }
                *grouped
                    .entry(luid)
                    .or_default()
                    .entry(engine)
                    .or_insert(0.0) += value;
            }

            for (luid, engines) in grouped {
                let busiest = engines.values().cloned().fold(0.0f64, f64::max);
                result.insert(luid, busiest.clamp(0.0, 100.0) as f32);
            }
        }

        result
    }
}

impl Drop for GpuEngineCounter {
    fn drop(&mut self) {
        unsafe {
            PdhCloseQuery(self.query);
        }
    }
}

/// Instance names look like
/// `pid_1234_luid_0x00000000_0x0000A29B_phys_0_eng_1_engtype_3D`.
fn parse_luid(instance: &str) -> Option<i64> {
    let rest = instance.split("luid_0x").nth(1)?;
    let mut parts = rest.split("_0x");
    let high = i64::from_str_radix(parts.next()?, 16).ok()?;
    let low_raw = parts.next()?;
    let low_hex: String = low_raw.chars().take_while(|c| c.is_ascii_hexdigit()).collect();
    let low = i64::from_str_radix(&low_hex, 16).ok()?;
    Some((high << 32) | low)
}

fn parse_engine_type(instance: &str) -> Option<String> {
    instance.split("engtype_").nth(1).map(|s| s.to_string())
}

pub struct GpuSampler {
    nvml: Option<Nvml>,
    engine_counter: Option<GpuEngineCounter>,
}

impl GpuSampler {
    pub fn new() -> Self {
        Self {
            nvml: Nvml::init().ok(),
            engine_counter: GpuEngineCounter::new(),
        }
    }

    pub fn sample(&mut self) -> Vec<GpuInfo> {
        let usage_by_luid = self
            .engine_counter
            .as_ref()
            .map(|c| c.sample())
            .unwrap_or_default();

        let nvidia = self.sample_nvml();
        let adapters = enumerate_adapters();

        if adapters.is_empty() {
            return nvidia.into_values().collect();
        }

        let mut nvidia = nvidia;
        let mut gpus = Vec::with_capacity(adapters.len());

        for adapter in adapters {
            let counter_usage = usage_by_luid.get(&adapter.luid).copied();
            let vram_total = if adapter.dedicated_vram > 0 {
                Some(adapter.dedicated_vram)
            } else {
                None
            };

            // NVML gives richer data (temperature, power, fans), so prefer it
            // and only fall back to what DXGI/PDH could tell us.
            if let Some(mut gpu) = take_matching_nvml(&mut nvidia, &adapter.name) {
                if gpu.usage.is_none() {
                    gpu.usage = counter_usage;
                }
                if gpu.vram_total.is_none() {
                    gpu.vram_total = vram_total;
                }
                if gpu.vram_used.is_none() {
                    gpu.vram_used = adapter.used_vram;
                }
                gpu.vram_usage = percent(gpu.vram_used, gpu.vram_total);
                gpus.push(gpu);
                continue;
            }

            gpus.push(GpuInfo {
                name: adapter.name,
                vendor: vendor_name(adapter.vendor_id).to_string(),
                usage: counter_usage,
                vram_used: adapter.used_vram,
                vram_total,
                vram_usage: percent(adapter.used_vram, vram_total),
                temperature: None,
                fan_speed: None,
                power: None,
                core_clock: None,
            });
        }

        // Any NVML device DXGI did not report (rare) still deserves a slot.
        gpus.extend(nvidia.into_values());
        gpus
    }

    fn sample_nvml(&self) -> HashMap<String, GpuInfo> {
        let mut result = HashMap::new();
        let Some(nvml) = self.nvml.as_ref() else {
            return result;
        };
        let Ok(count) = nvml.device_count() else {
            return result;
        };

        for index in 0..count {
            let Ok(device) = nvml.device_by_index(index) else {
                continue;
            };
            let name = device.name().unwrap_or_else(|_| format!("GPU {index}"));
            let memory = device.memory_info().ok();
            let vram_used = memory.as_ref().map(|m| m.used);
            let vram_total = memory.as_ref().map(|m| m.total);

            result.insert(
                name.to_lowercase(),
                GpuInfo {
                    name,
                    vendor: "NVIDIA".to_string(),
                    usage: device.utilization_rates().ok().map(|u| u.gpu as f32),
                    vram_used,
                    vram_total,
                    vram_usage: percent(vram_used, vram_total),
                    temperature: device
                        .temperature(nvml_wrapper::enum_wrappers::device::TemperatureSensor::Gpu)
                        .ok()
                        .map(|t| t as f32),
                    fan_speed: device.fan_speed(0).ok().map(|f| f as f32),
                    power: device.power_usage().ok().map(|mw| mw as f32 / 1000.0),
                    core_clock: device
                        .clock_info(nvml_wrapper::enum_wrappers::device::Clock::Graphics)
                        .ok(),
                },
            );
        }

        result
    }
}

fn take_matching_nvml(
    nvidia: &mut HashMap<String, GpuInfo>,
    adapter_name: &str,
) -> Option<GpuInfo> {
    let key = adapter_name.to_lowercase();
    if let Some(gpu) = nvidia.remove(&key) {
        return Some(gpu);
    }
    // DXGI and NVML occasionally disagree on the marketing name, so fall back
    // to the first NVIDIA device when the adapter is clearly an NVIDIA one.
    if key.contains("nvidia") || key.contains("geforce") || key.contains("quadro") {
        let first = nvidia.keys().next().cloned()?;
        return nvidia.remove(&first);
    }
    None
}

fn percent(used: Option<u64>, total: Option<u64>) -> Option<f32> {
    match (used, total) {
        (Some(used), Some(total)) if total > 0 => Some((used as f64 / total as f64 * 100.0) as f32),
        _ => None,
    }
}
