# Windows Media Info & Control Tool

A real-time Windows media information monitoring and control tool built with Rust. This tool provides JSON output of currently playing media and allows control of media playback through command-line arguments.

## Features

✅ **Real-time Media Monitoring** - Continuously monitors Windows media sessions  
✅ **JSON Output** - Clean, structured data output for programmatic use  
✅ **Album Artwork Extraction** - Automatically saves album covers as `current_album_artwork.png`  
✅ **Media Playback Control** - Control media playback via command-line  
✅ **Efficient Updates** - Only outputs when media information changes  
✅ **Cross-Application Support** - Works with Spotify, YouTube Music, Windows Media Player, etc.  

## Installation

### Prerequisites
- Windows 10/11
- Rust (latest stable version)

### Build from Source
```bash
git clone <repository-url>
cd win-media-info-rust
cargo build --release
```

The executable will be available at `target/release/win-media-info.exe`

## Usage

### Monitoring Mode (Default)
Start real-time monitoring of media information:
```bash
# Using Cargo
cargo run --release

# Using built executable
win-media-info.exe
```

### Media Control Commands
Control currently playing media:

```bash
# Skip to next track
cargo run --release -- skip-track

# Go to previous track
cargo run --release -- previous-track

# Toggle play/pause
cargo run --release -- toggle-play-pause

# Pause playback
cargo run --release -- pause

# Resume playback
cargo run --release -- resume

# Show help
cargo run --release -- --help
```

## JSON Output Format

### Monitoring Mode Output
```json
{
  "title": "Song Title",
  "artist": "Artist Name",
  "album": "Album Name",
  "playback_status": "Playing",
  "position": 45000,
  "duration": 240000,
  "app_name": "Spotify.exe",
  "has_artwork": true
}
```

### Control Command Output
```json
// Success
{"success": true, "command": "SkipTrack"}

// Failure
{"success": false, "command": "Pause", "error": "Command failed"}

// No active session
{"error": "No active media session found"}
```

## Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `title` | `string?` | Current track title |
| `artist` | `string?` | Artist name |
| `album` | `string?` | Album name |
| `playback_status` | `string` | Current status: "Playing", "Paused", "Stopped", "Unknown" |
| `position` | `number?` | Current playback position in milliseconds |
| `duration` | `number?` | Total track duration in milliseconds |
| `app_name` | `string?` | Source application identifier |
| `has_artwork` | `boolean` | Whether album artwork was found and saved |

## Album Artwork

When available, album artwork is automatically extracted and saved as `current_album_artwork.png` in the current working directory. The `has_artwork` field indicates whether artwork was successfully saved.

## Supported Applications

This tool works with any Windows application that implements the System Media Transport Controls, including:

- Spotify
- YouTube Music
- Windows Media Player
- VLC Media Player
- iTunes
- Chrome/Edge (when playing media)
- And many more...

## Command Line Options

```
Windows Media Information and Control Tool

Usage: win-media-info [COMMAND]

Commands:
  skip-track         Skip to next track
  previous-track     Go to previous track
  toggle-play-pause  Toggle play/pause
  pause              Pause playback
  resume             Resume playback
  monitor            Monitor media info (default behavior)
  help               Print this message or the help of the given subcommand(s)

Options:
  -h, --help  Print help
```

## Integration Examples

### PowerShell Integration
```powershell
# Get current media info
$mediaInfo = .\win-media-info.exe | ConvertFrom-Json
Write-Host "Now playing: $($mediaInfo.artist) - $($mediaInfo.title)"

# Control playback
.\win-media-info.exe skip-track
```

### Batch Script Integration
```batch
@echo off
win-media-info.exe skip-track
echo Track skipped
```

### Node.js Integration
```javascript
const { exec } = require('child_process');

// Get media info
exec('win-media-info.exe', (error, stdout, stderr) => {
    if (!error) {
        const mediaInfo = JSON.parse(stdout.trim());
        console.log(`Playing: ${mediaInfo.title} by ${mediaInfo.artist}`);
    }
});

// Control playback
exec('win-media-info.exe toggle-play-pause', (error, stdout) => {
    console.log(stdout);
});
```

## Performance

- **Monitoring Frequency**: Checks for changes every 500ms
- **CPU Usage**: Minimal impact on system performance
- **Memory Usage**: Low memory footprint
- **Network**: No network connectivity required

## Troubleshooting

### No Media Session Found
- Ensure a media application is running and playing content
- Check that the application supports Windows Media Transport Controls
- Try restarting the media application

### Permission Issues
- Run as administrator if experiencing access issues
- Ensure Windows Media Transport Controls are enabled

### Missing Album Artwork
- Not all applications provide album artwork through the API
- Some streaming services may not expose artwork for copyright reasons
- The `has_artwork` field will be `false` when artwork is unavailable

## Dependencies

- **windows**: Windows API bindings
- **serde**: JSON serialization
- **tokio**: Async runtime
- **clap**: Command-line argument parsing
- **image**: Image processing (for artwork handling)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly on Windows
5. Submit a pull request

## License

[Add your license information here]

## Changelog

### v1.0.0
- Initial release
- Real-time media monitoring
- Album artwork extraction
- Basic media controls
- JSON output format
