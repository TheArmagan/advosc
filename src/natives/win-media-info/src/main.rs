use serde::{Deserialize, Serialize};
use std::time::Duration;
use std::fs;
use tokio::time;
use clap::{Parser, Subcommand};
use windows::{
    core::*,
    Media::Control::*,
    Storage::Streams::*,
    Win32::Foundation::*,
};

#[derive(Parser)]
#[command(name = "win-media-info")]
#[command(about = "Windows Media Information and Control Tool")]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,
    
    /// Enable saving album artwork to current_album_artwork.png
    #[arg(long, default_value_t = false)]
    enable_artwork: bool,
}

#[derive(Subcommand, Debug)]
enum Commands {
    /// Skip to next track
    SkipTrack,
    /// Go to previous track
    PreviousTrack,
    /// Toggle play/pause
    TogglePlayPause,
    /// Pause playback
    Pause,
    /// Resume playback
    Resume,
    /// Monitor media info (default behavior)
    Monitor,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct MediaInfo {
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    playback_status: String,
    position: Option<u64>,
    duration: Option<u64>,
    app_name: Option<String>,
    has_artwork: bool,
}

impl Default for MediaInfo {
    fn default() -> Self {
        Self {
            title: None,
            artist: None,
            album: None,
            playback_status: "Unknown".to_string(),
            position: None,
            duration: None,
            app_name: None,
            has_artwork: false,
        }
    }
}

async fn save_album_artwork(thumbnail: &IRandomAccessStreamReference) -> Result<()> {
    let stream = thumbnail.OpenReadAsync()?.await?;
    let size = stream.Size()? as usize;
    
    if size == 0 {
        return Err(windows::core::Error::from_hresult(E_FAIL));
    }

    let buffer = Buffer::Create(size as u32)?;
    let bytes_read = stream.ReadAsync(&buffer, size as u32, InputStreamOptions::None)?.await?;
    
    if bytes_read.Length()? == 0 {
        return Err(windows::core::Error::from_hresult(E_FAIL));
    }

    // Get current directory path
    let current_dir = std::env::current_dir().map_err(|e| windows::core::Error::from(e))?;
    let artwork_path = current_dir.join("current_album_artwork.png");

    // Convert buffer to bytes and save
    let data_reader = DataReader::FromBuffer(&bytes_read)?;
    let mut bytes = vec![0u8; bytes_read.Length()? as usize];
    data_reader.ReadBytes(&mut bytes)?;

    fs::write(&artwork_path, &bytes).map_err(|e| windows::core::Error::from(e))?;
    
    Ok(())
}

async fn get_media_info(enable_artwork: bool) -> Result<MediaInfo> {
    let session_manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()?.await?;
    
    // Try to get current session, return default if none exists
    let current_session = match session_manager.GetCurrentSession() {
        Ok(session) => session,
        Err(_) => return Ok(MediaInfo::default()),
    };

    let mut media_info = MediaInfo::default();

    // Get playback info
    if let Ok(playback_info) = current_session.GetPlaybackInfo() {
        let status = playback_info.PlaybackStatus()?;
        media_info.playback_status = match status {
            GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing => "Playing".to_string(),
            GlobalSystemMediaTransportControlsSessionPlaybackStatus::Paused => "Paused".to_string(),
            GlobalSystemMediaTransportControlsSessionPlaybackStatus::Stopped => "Stopped".to_string(),
            _ => "Unknown".to_string(),
        };
    }

    // Get timeline properties
    if let Ok(timeline_props) = current_session.GetTimelineProperties() {
        if let Ok(position) = timeline_props.Position() {
            media_info.position = Some(position.Duration as u64 / 10_000); // Convert to milliseconds
        }
        if let Ok(duration) = timeline_props.EndTime() {
            media_info.duration = Some(duration.Duration as u64 / 10_000); // Convert to milliseconds
        }
    }

    // Get media properties
    if let Ok(media_properties) = current_session.TryGetMediaPropertiesAsync()?.await {
        if let Ok(title) = media_properties.Title() {
            if !title.is_empty() {
                media_info.title = Some(title.to_string());
            }
        }
        if let Ok(artist) = media_properties.Artist() {
            if !artist.is_empty() {
                media_info.artist = Some(artist.to_string());
            }
        }
        if let Ok(album) = media_properties.AlbumTitle() {
            if !album.is_empty() {
                media_info.album = Some(album.to_string());
            }
        }

        // Save album artwork only if enabled
        if enable_artwork {
            if let Ok(thumbnail) = media_properties.Thumbnail() {
                if let Ok(_) = save_album_artwork(&thumbnail).await {
                    media_info.has_artwork = true;
                }
            }
        }
    }

    // Get source app info
    if let Ok(source_app_info) = current_session.SourceAppUserModelId() {
        if !source_app_info.is_empty() {
            media_info.app_name = Some(source_app_info.to_string());
        }
    }

    Ok(media_info)
}

async fn execute_media_control(command: &Commands) -> Result<()> {
    let session_manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()?.await?;
    
    let current_session = match session_manager.GetCurrentSession() {
        Ok(session) => session,
        Err(_) => {
            println!("{{\"error\": \"No active media session found\"}}");
            return Ok(());
        }
    };

    let result = match command {
        Commands::SkipTrack => {
            current_session.TrySkipNextAsync()?.await
        }
        Commands::PreviousTrack => {
            current_session.TrySkipPreviousAsync()?.await
        }
        Commands::TogglePlayPause => {
            current_session.TryTogglePlayPauseAsync()?.await
        }
        Commands::Pause => {
            current_session.TryPauseAsync()?.await
        }
        Commands::Resume => {
            current_session.TryPlayAsync()?.await
        }
        Commands::Monitor => return Ok(()), // This shouldn't happen but just in case
    };

    match result {
        Ok(success) => {
            if success {
                println!("{{\"success\": true, \"command\": \"{:?}\"}}",  command);
            } else {
                println!("{{\"success\": false, \"command\": \"{:?}\", \"error\": \"Command failed\"}}",  command);
            }
        }
        Err(_) => {
            println!("{{\"success\": false, \"command\": \"{:?}\", \"error\": \"Command not supported\"}}",  command);
        }
    }

    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    // If a control command is provided (not Monitor), execute it and exit
    if let Some(command) = &cli.command {
        match command {
            Commands::Monitor => {
                // Fall through to monitoring loop below
            }
            _ => {
                // Execute the control command and exit
                return execute_media_control(command).await;
            }
        }
    }

    // Default behavior: monitor media info
    let mut last_media_info: Option<MediaInfo> = None;

    loop {
        match get_media_info(cli.enable_artwork).await {
            Ok(media_info) => {
                // Only print if media info has changed or if this is the first time
                let should_print = match &last_media_info {
                    Some(last) => {
                        last.title != media_info.title ||
                        last.artist != media_info.artist ||
                        last.album != media_info.album ||
                        last.playback_status != media_info.playback_status ||
                        last.app_name != media_info.app_name ||
                        last.has_artwork != media_info.has_artwork ||
                        // For position, only print if there's a significant change (more than 1 second)
                        match (last.position, media_info.position) {
                            (Some(last_pos), Some(curr_pos)) => (last_pos as i64 - curr_pos as i64).abs() > 1000,
                            (None, Some(_)) | (Some(_), None) => true,
                            _ => false,
                        }
                    }
                    None => true,
                };

                if should_print {
                    let json_output = serde_json::to_string(&media_info).unwrap_or_else(|_| "{}".to_string());
                    println!("{}", json_output);
                    last_media_info = Some(media_info);
                }
            }
            Err(_) => {
                // If we can't get media info, only print if we previously had valid info
                if last_media_info.is_some() {
                    let empty_info = MediaInfo::default();
                    let json_output = serde_json::to_string(&empty_info).unwrap_or_else(|_| "{}".to_string());
                    println!("{}", json_output);
                    last_media_info = None;
                }
            }
        }

        // Wait 500ms before checking again
        time::sleep(Duration::from_millis(500)).await;
    }
}
