import type { ChatboxModuleOptions } from "../module-base";

export const mediaInfoOptions: ChatboxModuleOptions = {
  id: "MediaInfo",
  name: "Media Info",
  description: "Provides information about the currently playing media.",
  examplePlaceholders: {
    "Status": {
      value: "Playing",
      description: "The current playback status of the media (Playing, Paused, Stopped, Unknown)."
    },
    "Position": {
      value: "120000",
      description: "The current position of the media in milliseconds."
    },
    "Duration": {
      value: "300000",
      description: "The total duration of the media in milliseconds."
    },
    "AppName": {
      value: "Spotify",
      description: "The name of the application playing the media."
    },
    "Artist": {
      value: "Artist Name",
      description: "The artist of the currently playing media."
    },
    "Album": {
      value: "Album Name",
      description: "The album name of the currently playing media."
    },
    "Track": {
      value: "Track Title",
      description: "The title of the currently playing track."
    },
    "Lyric": {
      value: "Some lyric line",
      description: "The current line of lyrics being displayed."
    }
  }
};
