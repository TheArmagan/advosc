import { chatbox } from "..";
import { ChatboxModule } from "../chatbox-module";
import type { SystemGpuInfo, SystemInfo } from "../../../../../main/preload";

export type { SystemInfo, SystemGpuInfo };

/**
 * The native helper samples every 2 seconds, so anything shorter than a render
 * tick is enough to keep one template pass from spamming IPC.
 */
const CACHE_TTL = 1000;

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;
type ByteUnit = (typeof BYTE_UNITS)[number];

export class ChatboxSystemModule extends ChatboxModule {
  private cache: SystemInfo | null = null;
  private cachedAt = 0;
  private pending: Promise<SystemInfo | null> | null = null;

  constructor() {
    super({
      id: "System",
      name: "System Resources",
      description:
        "Live CPU, GPU, memory and network usage. Byte values take an optional unit (auto, B, KB, MB, GB, TB) and decimal count.",
      examplePlaceholders: {
        "CPUName": {
          value: "AMD Ryzen 9 7950X 16-Core Processor",
          description: "Model name of the processor.",
          fillText: "System;CPUName",
        },
        "CPUUsage": {
          value: "13.7",
          description: "Overall CPU usage percentage. Optional decimal count, defaults to 1.",
          fillText: "System;CPUUsage;${1:decimals}",
        },
        "CPUCoreUsage": {
          value: "24.5",
          description: "Usage percentage of a single logical core, by zero based index. Optional decimal count, defaults to 1.",
          fillText: "System;CPUCoreUsage;${1:index};${2:decimals}",
        },
        "CPUCores": {
          value: "16",
          description: "Number of physical CPU cores.",
          fillText: "System;CPUCores",
        },
        "CPUThreads": {
          value: "32",
          description: "Number of logical CPU cores (threads).",
          fillText: "System;CPUThreads",
        },
        "CPUFrequency": {
          value: "4501",
          description: "Current CPU frequency in MHz.",
          fillText: "System;CPUFrequency",
        },
        "CPUTemperature": {
          value: "62",
          description: "CPU temperature in celsius. Empty when Windows exposes no readable sensor.",
          fillText: "System;CPUTemperature;${1:decimals}",
        },
        "MemoryUsed": {
          value: "31.2 GB",
          description: "Memory in use. Optional unit and decimal count.",
          fillText: "System;MemoryUsed;${1:unit};${2:decimals}",
        },
        "MemoryTotal": {
          value: "127.2 GB",
          description: "Total physical memory. Optional unit and decimal count.",
          fillText: "System;MemoryTotal;${1:unit};${2:decimals}",
        },
        "MemoryAvailable": {
          value: "95.9 GB",
          description: "Memory available to applications. Optional unit and decimal count.",
          fillText: "System;MemoryAvailable;${1:unit};${2:decimals}",
        },
        "MemoryUsage": {
          value: "24.6",
          description: "Memory usage percentage. Optional decimal count, defaults to 1.",
          fillText: "System;MemoryUsage;${1:decimals}",
        },
        "SwapUsed": {
          value: "0 B",
          description: "Page file in use. Optional unit and decimal count.",
          fillText: "System;SwapUsed;${1:unit};${2:decimals}",
        },
        "SwapTotal": {
          value: "8 GB",
          description: "Total page file size. Optional unit and decimal count.",
          fillText: "System;SwapTotal;${1:unit};${2:decimals}",
        },
        "SwapUsage": {
          value: "0.0",
          description: "Page file usage percentage. Optional decimal count, defaults to 1.",
          fillText: "System;SwapUsage;${1:decimals}",
        },
        "GPUName": {
          value: "NVIDIA GeForce RTX 3070 Ti",
          description: "Name of the GPU. The finder can be a zero based index or part of the name or vendor, empty picks the GPU with the most VRAM.",
          fillText: "System;GPUName;${1:gpu}",
        },
        "GPUUsage": {
          value: "42.0",
          description: "GPU utilization percentage. Optional finder and decimal count.",
          fillText: "System;GPUUsage;${1:gpu};${2:decimals}",
        },
        "GPUTemperature": {
          value: "53",
          description: "GPU temperature in celsius. NVIDIA cards only, empty on others.",
          fillText: "System;GPUTemperature;${1:gpu};${2:decimals}",
        },
        "GPUPower": {
          value: "52.1",
          description: "GPU power draw in watts. NVIDIA cards only, empty on others.",
          fillText: "System;GPUPower;${1:gpu};${2:decimals}",
        },
        "GPUFanSpeed": {
          value: "0",
          description: "GPU fan speed percentage. NVIDIA cards only, empty on others.",
          fillText: "System;GPUFanSpeed;${1:gpu};${2:decimals}",
        },
        "GPUCoreClock": {
          value: "1020",
          description: "GPU core clock in MHz. NVIDIA cards only, empty on others.",
          fillText: "System;GPUCoreClock;${1:gpu}",
        },
        "GPUVendor": {
          value: "NVIDIA",
          description: "Vendor of the GPU: NVIDIA, AMD, Intel or Unknown.",
          fillText: "System;GPUVendor;${1:gpu}",
        },
        "GPUCount": {
          value: "2",
          description: "Number of detected GPUs.",
          fillText: "System;GPUCount",
        },
        "VRAMUsed": {
          value: "2.7 GB",
          description: "VRAM in use. Optional finder, unit and decimal count.",
          fillText: "System;VRAMUsed;${1:gpu};${2:unit};${3:decimals}",
        },
        "VRAMTotal": {
          value: "8 GB",
          description: "Total VRAM. Optional finder, unit and decimal count.",
          fillText: "System;VRAMTotal;${1:gpu};${2:unit};${3:decimals}",
        },
        "VRAMUsage": {
          value: "34.3",
          description: "VRAM usage percentage. Optional finder and decimal count.",
          fillText: "System;VRAMUsage;${1:gpu};${2:decimals}",
        },
        "Upload": {
          value: "1.5 MB/s",
          description: "Current upload speed. Optional unit and decimal count, 'auto' appends the unit and /s.",
          fillText: "System;Upload;${1:unit};${2:decimals}",
        },
        "Download": {
          value: "12.1 MB/s",
          description: "Current download speed. Optional unit and decimal count, 'auto' appends the unit and /s.",
          fillText: "System;Download;${1:unit};${2:decimals}",
        },
        "TotalUploaded": {
          value: "32.6 GB",
          description: "Bytes uploaded since boot. Optional unit and decimal count.",
          fillText: "System;TotalUploaded;${1:unit};${2:decimals}",
        },
        "TotalDownloaded": {
          value: "24.0 GB",
          description: "Bytes downloaded since boot. Optional unit and decimal count.",
          fillText: "System;TotalDownloaded;${1:unit};${2:decimals}",
        },
        "Uptime": {
          value: "22h 41m",
          description: "Time since boot. Format can be auto (default), seconds, minutes, hours, days or clock.",
          fillText: "System;Uptime;${1:format}",
        },
      },
    });
  }

  private async getInfo(): Promise<SystemInfo | null> {
    const now = Date.now();
    if (this.cache && now - this.cachedAt < CACHE_TTL) return this.cache;
    if (this.pending) return this.pending;

    this.pending = window.ADVOSCNative.utils
      .getSystemInfo()
      .then((result) => {
        // The first read lands before the helper has produced a sample, so keep
        // the previous snapshot instead of blanking the chatbox.
        if (result.info) {
          this.cache = result.info;
          this.cachedAt = Date.now();
        }
        return this.cache;
      })
      .catch(() => this.cache)
      .finally(() => {
        this.pending = null;
      });

    return this.pending;
  }

  /** Finder can be an index, or part of the name or vendor. */
  private findGpu(gpus: SystemGpuInfo[], finder: string): SystemGpuInfo | undefined {
    if (!gpus.length) return undefined;

    if (!finder) {
      // Without a finder the discrete card is almost always what people mean.
      return gpus.reduce((best, gpu) =>
        (gpu.vramTotal ?? 0) > (best.vramTotal ?? 0) ? gpu : best
      );
    }

    const index = parseInt(finder, 10);
    if (!isNaN(index) && String(index) === finder.trim() && gpus[index]) return gpus[index];

    const needle = finder.toLowerCase();
    return (
      gpus.find((gpu) => gpu.name.toLowerCase().includes(needle)) ??
      gpus.find((gpu) => gpu.vendor.toLowerCase().includes(needle))
    );
  }

  async getPlaceholderValue(key: string, ...params: string[]): Promise<string> {
    [key, ...params] = await chatbox.fillTemplates([key, ...params], "[[:]]", false, chatbox.getInstanceKey());

    try {
      const info = await this.getInfo();
      if (!info) return "";

      switch (key) {
        case "CPUName":
          return info.cpu.name;
        case "CPUUsage":
          return formatNumber(info.cpu.usage, params[0], 1);
        case "CPUCoreUsage": {
          const index = parseInt(params[0], 10);
          const usage = info.cpu.perCoreUsage[index];
          return usage === undefined ? "" : formatNumber(usage, params[1], 1);
        }
        case "CPUCores":
          return info.cpu.physicalCores === null ? "" : String(info.cpu.physicalCores);
        case "CPUThreads":
          return String(info.cpu.logicalCores);
        case "CPUFrequency":
          return String(info.cpu.frequency);
        case "CPUTemperature":
          return formatNumber(info.cpu.temperature, params[0], 0);

        case "MemoryUsed":
          return formatBytes(info.memory.used, params[0], params[1]);
        case "MemoryTotal":
          return formatBytes(info.memory.total, params[0], params[1]);
        case "MemoryAvailable":
          return formatBytes(info.memory.available, params[0], params[1]);
        case "MemoryUsage":
          return formatNumber(info.memory.usage, params[0], 1);
        case "SwapUsed":
          return formatBytes(info.memory.swapUsed, params[0], params[1]);
        case "SwapTotal":
          return formatBytes(info.memory.swapTotal, params[0], params[1]);
        case "SwapUsage":
          return formatNumber(info.memory.swapUsage, params[0], 1);

        case "GPUCount":
          return String(info.gpus.length);
        case "GPUName":
        case "GPUVendor":
        case "GPUUsage":
        case "GPUTemperature":
        case "GPUPower":
        case "GPUFanSpeed":
        case "GPUCoreClock":
        case "VRAMUsed":
        case "VRAMTotal":
        case "VRAMUsage": {
          const gpu = this.findGpu(info.gpus, params[0] ?? "");
          if (!gpu) return "";

          switch (key) {
            case "GPUName":
              return gpu.name;
            case "GPUVendor":
              return gpu.vendor;
            case "GPUUsage":
              return formatNumber(gpu.usage, params[1], 1);
            case "GPUTemperature":
              return formatNumber(gpu.temperature, params[1], 0);
            case "GPUPower":
              return formatNumber(gpu.power, params[1], 1);
            case "GPUFanSpeed":
              return formatNumber(gpu.fanSpeed, params[1], 0);
            case "GPUCoreClock":
              return gpu.coreClock === null ? "" : String(gpu.coreClock);
            case "VRAMUsed":
              return formatBytes(gpu.vramUsed, params[1], params[2]);
            case "VRAMTotal":
              return formatBytes(gpu.vramTotal, params[1], params[2]);
            default:
              return formatNumber(gpu.vramUsage, params[1], 1);
          }
        }

        case "Upload":
          return formatBytes(info.network.upload, params[0], params[1], "/s");
        case "Download":
          return formatBytes(info.network.download, params[0], params[1], "/s");
        case "TotalUploaded":
          return formatBytes(info.network.totalUploaded, params[0], params[1]);
        case "TotalDownloaded":
          return formatBytes(info.network.totalDownloaded, params[0], params[1]);

        case "Uptime":
          return formatUptime(info.uptime, params[0]);

        default:
          return "";
      }
    } catch (e) {
      return `(System error: ${e})`;
    }
  }
}

function parseDecimals(raw: string | undefined, fallback: number): number {
  const parsed = parseInt(raw ?? "", 10);
  if (isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, 0), 10);
}

function formatNumber(value: number | null, decimals: string | undefined, fallback: number): string {
  if (value === null || value === undefined || !isFinite(value)) return "";
  return value.toFixed(parseDecimals(decimals, fallback));
}

/**
 * With no unit (or "auto") the value scales to the largest sensible unit and
 * keeps its label, otherwise the caller picked a unit and only wants the number.
 */
function formatBytes(
  bytes: number | null,
  unit: string | undefined,
  decimals: string | undefined,
  suffix = ""
): string {
  if (bytes === null || bytes === undefined || !isFinite(bytes)) return "";

  const requested = (unit ?? "").trim().toUpperCase();
  const explicit = BYTE_UNITS.indexOf(requested as ByteUnit);

  if (explicit >= 0) {
    const value = bytes / Math.pow(1024, explicit);
    return value.toFixed(parseDecimals(decimals, explicit === 0 ? 0 : 1));
  }

  let index = 0;
  let value = Math.abs(bytes);
  while (value >= 1024 && index < BYTE_UNITS.length - 1) {
    value /= 1024;
    index++;
  }
  if (bytes < 0) value = -value;

  return `${value.toFixed(parseDecimals(decimals, index === 0 ? 0 : 1))} ${BYTE_UNITS[index]}${suffix}`;
}

function formatUptime(seconds: number, format: string | undefined): string {
  const total = Math.max(0, Math.floor(seconds));

  switch ((format ?? "").trim().toLowerCase()) {
    case "seconds":
      return String(total);
    case "minutes":
      return String(Math.floor(total / 60));
    case "hours":
      return String(Math.floor(total / 3600));
    case "days":
      return String(Math.floor(total / 86400));
    case "clock": {
      const hours = Math.floor(total / 3600);
      const minutes = Math.floor((total % 3600) / 60);
      const secs = total % 60;
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }
    default: {
      const days = Math.floor(total / 86400);
      const hours = Math.floor((total % 86400) / 3600);
      const minutes = Math.floor((total % 3600) / 60);
      if (days > 0) return `${days}d ${hours}h`;
      if (hours > 0) return `${hours}h ${minutes}m`;
      return `${minutes}m`;
    }
  }
}
