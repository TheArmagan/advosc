import type { ModuleOptions } from "../module-base";

export const systemOptions: ModuleOptions = {
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
};
