use serde::Serialize;
use std::time::Instant;
use sysinfo::{Components, Networks, System};

use crate::gpu_info::{GpuInfo, GpuSampler};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CpuInfo {
    pub name: String,
    pub vendor: String,
    /// Overall usage percentage (0-100).
    pub usage: f32,
    pub physical_cores: Option<usize>,
    pub logical_cores: usize,
    /// Current frequency in MHz.
    pub frequency: u64,
    pub per_core_usage: Vec<f32>,
    /// Celsius, when a readable sensor exists (rarely available on Windows).
    pub temperature: Option<f32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryInfo {
    pub used: u64,
    pub total: u64,
    pub available: u64,
    /// Used percentage (0-100).
    pub usage: f32,
    pub swap_used: u64,
    pub swap_total: u64,
    pub swap_usage: f32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkInterfaceInfo {
    pub name: String,
    /// Bytes per second.
    pub upload: f64,
    pub download: f64,
    pub total_uploaded: u64,
    pub total_downloaded: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkInfo {
    /// Bytes per second, summed over every interface.
    pub upload: f64,
    pub download: f64,
    pub total_uploaded: u64,
    pub total_downloaded: u64,
    pub interfaces: Vec<NetworkInterfaceInfo>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemSnapshot {
    pub cpu: CpuInfo,
    pub memory: MemoryInfo,
    pub gpus: Vec<GpuInfo>,
    pub network: NetworkInfo,
    /// Seconds since boot.
    pub uptime: u64,
}

pub struct SystemSampler {
    system: System,
    networks: Networks,
    components: Components,
    gpus: GpuSampler,
    last_sample: Instant,
}

impl SystemSampler {
    pub fn new() -> Self {
        let mut system = System::new();
        system.refresh_cpu_all();
        system.refresh_memory();

        Self {
            system,
            networks: Networks::new_with_refreshed_list(),
            components: Components::new_with_refreshed_list(),
            gpus: GpuSampler::new(),
            last_sample: Instant::now(),
        }
    }

    pub fn sample(&mut self) -> SystemSnapshot {
        self.system.refresh_cpu_all();
        self.system.refresh_memory();
        self.networks.refresh(true);
        self.components.refresh(true);

        let elapsed = self.last_sample.elapsed().as_secs_f64().max(0.001);
        self.last_sample = Instant::now();

        SystemSnapshot {
            cpu: self.cpu_info(),
            memory: self.memory_info(),
            gpus: self.gpus.sample(),
            network: self.network_info(elapsed),
            uptime: System::uptime(),
        }
    }

    fn cpu_info(&self) -> CpuInfo {
        let cpus = self.system.cpus();
        let first = cpus.first();

        CpuInfo {
            name: first
                .map(|c| c.brand().trim().to_string())
                .filter(|b| !b.is_empty())
                .unwrap_or_else(|| "Unknown CPU".to_string()),
            vendor: first
                .map(|c| c.vendor_id().trim().to_string())
                .unwrap_or_default(),
            usage: self.system.global_cpu_usage(),
            physical_cores: self.system.physical_core_count(),
            logical_cores: cpus.len(),
            frequency: first.map(|c| c.frequency()).unwrap_or(0),
            per_core_usage: cpus.iter().map(|c| c.cpu_usage()).collect(),
            temperature: self.cpu_temperature(),
        }
    }

    fn cpu_temperature(&self) -> Option<f32> {
        self.components
            .iter()
            .find(|c| {
                let label = c.label().to_lowercase();
                label.contains("cpu") || label.contains("core") || label.contains("package")
            })
            .and_then(|c| c.temperature())
    }

    fn memory_info(&self) -> MemoryInfo {
        let total = self.system.total_memory();
        let used = self.system.used_memory();
        let swap_total = self.system.total_swap();
        let swap_used = self.system.used_swap();

        MemoryInfo {
            used,
            total,
            available: self.system.available_memory(),
            usage: ratio(used, total),
            swap_used,
            swap_total,
            swap_usage: ratio(swap_used, swap_total),
        }
    }

    fn network_info(&self, elapsed: f64) -> NetworkInfo {
        let mut interfaces = Vec::new();
        let mut upload = 0.0;
        let mut download = 0.0;
        let mut total_uploaded = 0u64;
        let mut total_downloaded = 0u64;

        for (name, data) in self.networks.iter() {
            let iface_up = data.transmitted() as f64 / elapsed;
            let iface_down = data.received() as f64 / elapsed;

            upload += iface_up;
            download += iface_down;
            total_uploaded += data.total_transmitted();
            total_downloaded += data.total_received();

            interfaces.push(NetworkInterfaceInfo {
                name: name.clone(),
                upload: iface_up,
                download: iface_down,
                total_uploaded: data.total_transmitted(),
                total_downloaded: data.total_received(),
            });
        }

        NetworkInfo {
            upload,
            download,
            total_uploaded,
            total_downloaded,
            interfaces,
        }
    }
}

fn ratio(used: u64, total: u64) -> f32 {
    if total == 0 {
        0.0
    } else {
        (used as f64 / total as f64 * 100.0) as f32
    }
}
