# ADVOSC Utils

A modular command-line utility tool for ADVOSC's native requirements on Windows. Built with Rust for high performance and reliability.

## Features

✅ **Process Start Time** - Get the start time of any running process in Unix timestamp  
✅ **OpenVR Tracker Battery Levels** - Monitor battery levels of VR trackers and controllers  
✅ **JSON Output** - Clean, structured data output for programmatic use  
✅ **Modular Design** - Easy to extend with new utilities  

## Build Prerequisites

### Required Tools

The `openvr` crate requires CMake and a C++ compiler to build. Follow these setup instructions:

#### 1. Install Visual Studio Build Tools (C++ Compiler)

Download and install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the following workloads:
- **"Desktop development with C++"**

Or if you have Visual Studio installed, ensure the C++ workload is enabled.

#### 2. Install CMake

**Option A: Download from CMake website (Recommended)**
1. Go to https://cmake.org/download/
2. Download the Windows x64 Installer (e.g., `cmake-3.x.x-windows-x86_64.msi`)
3. Run the installer
4. **Important:** Select "Add CMake to the system PATH for all users" during installation

**Option B: Using Chocolatey**
```powershell
choco install cmake --installargs 'ADD_CMAKE_TO_PATH=System'
```

**Option C: Using Scoop**
```powershell
scoop install cmake
```

**Option D: Using winget**
```powershell
winget install Kitware.CMake
```

#### 3. Verify Installation

Open a **new** terminal (to refresh PATH) and verify:

```powershell
# Check CMake
cmake --version
# Should output: cmake version 3.x.x

# Check C++ compiler (should find cl.exe)
where cl
# Or run from Developer Command Prompt
```

#### 4. Install Rust

If not already installed:
```powershell
# Download and run rustup-init.exe from https://rustup.rs/
rustup-init.exe
```

### Build from Source

```bash
cd src/natives/advosc-utils
cargo build --release
```

The executable will be available at `target/release/advosc-utils.exe`

### Troubleshooting Build Issues

**"cmake not found" error:**
- Ensure CMake is installed and in your PATH
- Open a new terminal after installing CMake
- Run `cmake --version` to verify

**"cl.exe not found" or MSVC errors:**
- Install Visual Studio Build Tools with C++ workload
- Build from "Developer Command Prompt for VS" or "x64 Native Tools Command Prompt"
- Or run `vcvarsall.bat x64` before building

**"failed to run custom build command for openvr_sys":**
- This usually means CMake or C++ compiler is missing
- Follow the prerequisites above

## Usage

### Get Process Start Time
Get the Unix timestamp (in milliseconds) when a process was started:

```bash
# Get VRChat's start time
advosc-utils.exe start-time VRChat

# Also works with .exe extension
advosc-utils.exe start-time VRChat.exe
```

**Output:**
```json
{"start_time":1733750400000}
```

**Error Output (process not found):**
```json
{"start_time":null,"error":"Process 'VRChat' not found"}
```

### Get OpenVR Trackers
Get battery levels of all connected VR devices (trackers, controllers, HMDs).
**Note:** This command only works when SteamVR (vrserver.exe) is running.

```bash
advosc-utils.exe openvr-trackers
```

**Output (when SteamVR is running):**
```json
{
  "trackers": [
    {
      "device_index": 1,
      "serial_number": "LHR-12345678",
      "model_number": "Vive Tracker 3.0",
      "battery_level": 0.85,
      "is_charging": false,
      "device_class": "Tracker"
    },
    {
      "device_index": 3,
      "serial_number": "LHR-87654321",
      "model_number": "VIVE Controller MV",
      "battery_level": 0.42,
      "is_charging": true,
      "device_class": "Controller"
    }
  ]
}
```

**Error Output (SteamVR not running):**
```json
{"error":"SteamVR is not running (vrserver.exe not found)"}
```

### Help
```bash
advosc-utils.exe --help
advosc-utils.exe start-time --help
advosc-utils.exe openvr-tracker-battery-levels --help
```

## JSON Output Format

### Start Time Response

| Field | Type | Description |
|-------|------|-------------|
| `start_time` | `number?` | Unix timestamp in milliseconds when the process started |
| `error` | `string?` | Error message if the operation failed |

### Tracker Battery Response

| Field | Type | Description |
|-------|------|-------------|
| `trackers` | `array?` | Array of tracker battery information |
| `error` | `string?` | Error message if the operation failed |

### Tracker Battery Object

| Field | Type | Description |
|-------|------|-------------|
| `device_index` | `number` | OpenVR device index |
| `serial_number` | `string?` | Device serial number |
| `model_number` | `string?` | Device model name |
| `battery_level` | `number` | Battery level from 0.0 to 1.0 (0-100%) |
| `is_charging` | `boolean` | Whether the device is currently charging |
| `device_class` | `string` | Device type: "Tracker", "Controller", "HMD", etc. |

## Integration with ADVOSC

### Node.js/Electron Integration
```javascript
const { execFile } = require('child_process');

// Get process start time
execFile('advosc-utils.exe', ['start-time', 'VRChat'], (error, stdout) => {
    if (!error) {
        const result = JSON.parse(stdout);
        if (result.start_time) {
            console.log(`VRChat started at: ${new Date(result.start_time)}`);
        }
    }
});

// Get tracker battery levels
execFile('advosc-utils.exe', ['openvr-trackers'], (error, stdout) => {
    if (!error) {
        const result = JSON.parse(stdout);
        if (result.trackers) {
            result.trackers.forEach(tracker => {
                console.log(`${tracker.device_class}: ${Math.round(tracker.battery_level * 100)}%`);
            });
        }
    }
});
```

## Adding New Utilities

The tool is designed to be modular. To add a new utility:

1. Create a new module file in `src/` (e.g., `src/new_feature.rs`)
2. Add the module to `main.rs`: `mod new_feature;`
3. Add a new command variant to the `Commands` enum
4. Create appropriate response structs with `#[derive(Serialize)]`
5. Handle the command in the `main()` match statement

## Dependencies

- **windows**: Windows API bindings for process information
- **openvr**: OpenVR API bindings for VR device access
- **serde**: JSON serialization
- **clap**: Command-line argument parsing

## License

MIT License - See parent project for details
