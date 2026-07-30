import { localData } from "$lib/api/local-data";
import { type MediaInfo } from "../../../../../main/preload";
import { ChatboxModule } from "../chatbox-module";

interface LyricData {
  lyrics: {
    time: number,
    duration: number,
    text: string
  }[]
}

type LyricsCache = Record<string, { at: number; data: LyricData | null }>;

export class ChatboxMediaInfoModule extends ChatboxModule {
  lastMediaInfo: MediaInfo | null = null;
  lastPositionUpdatedAt: number = 0;
  lastLyricData: LyricData | null = null;
  currentLyric: LyricData | null = null;
  lastLyricKey: string | null = null;
  lyricFetchQueue: Map<string, Promise<LyricData | null>> = new Map();

  constructor() {
    super({
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
    });

    window.ADVOSCNative.media.onMediaInfo((info) => {
      if (info.position !== this.lastMediaInfo?.position) {
        this.lastPositionUpdatedAt = Date.now();
      };
      this.lastMediaInfo = info;
    });

    setInterval(() => this.cleanLyricData(), 1000 * 60 * 60 * 24);
    this.cleanLyricData();
  }

  cleanLyricData() {
    const cache = localData.get("ChatboxMediaModule;LyricsCache", {}) as LyricsCache;
    const now = Date.now();
    for (const key in cache) {
      if (now - cache[key].at > 1000 * 60 * 60 * 24) {
        delete cache[key];
      }
    }
    localData.set("ChatboxMediaModule;LyricsCache", cache);
  }

  getEstimatedPosition(): number | undefined {
    if (!this.lastMediaInfo?.position) return undefined;
    if (this.lastMediaInfo.playbackStatus !== "Playing") return this.lastMediaInfo.position / 1000;
    const elapsed = (Date.now() - this.lastPositionUpdatedAt) / 1000;
    return (this.lastMediaInfo.position / 1000) + elapsed;
  }

  fetchCurrentLyric(): LyricData | null {
    if (!this.lastMediaInfo) return null;
    const cacheKey = `${this.lastMediaInfo.title};${this.lastMediaInfo.artist};${(this.lastMediaInfo.duration! / 1000).toFixed(2)}`;

    if (this.lastLyricKey === cacheKey) return this.currentLyric;

    // If a fetch is already in progress for this key, return null immediately
    if (this.lyricFetchQueue.has(cacheKey)) {
      return null;
    }

    this.lastLyricKey = cacheKey;

    // Add the fetch operation to the queue
    const fetchPromise = this.fetchLyrics(
      this.lastMediaInfo.title!,
      this.lastMediaInfo.artist!,
      this.lastMediaInfo.duration! / 1000
    ).then((result) => {
      this.currentLyric = result;
      this.lyricFetchQueue.delete(cacheKey);
      return result;
    }).catch((error) => {
      console.error("Lyric fetch error:", error);
      this.lyricFetchQueue.delete(cacheKey);
      return null;
    });

    this.lyricFetchQueue.set(cacheKey, fetchPromise);

    // Return null while the fetch is still running
    return null;
  }

  getCurrentLyricLine(): string {
    if (!this.lastMediaInfo) return "";
    const lyric = this.fetchCurrentLyric();
    if (!lyric || !this.lastMediaInfo || this.lastMediaInfo.playbackStatus !== "Playing") return "";
    const currentTime = this.getEstimatedPosition()! * 1000;
    const currentLine = lyric.lyrics.find(l => l.time >= currentTime && currentTime <= l.time + l.duration)
    if (!currentLine) return "";
    return currentLine.text || "";
  }

  async fetchLyrics(trackName: string, artistName: string, duration: number): Promise<LyricData | null> {
    const cacheKey = encodeURIComponent(`${trackName};${artistName};${duration.toFixed(2)}`);
    const cache = localData.get("ChatboxMediaModule;LyricsCache;V2", {}) as LyricsCache;
    const cached = cache[cacheKey];
    if (!cached || Date.now() - cached.at > 1000 * 60 * 60 * 24 * 2) {
      const res = await fetch(
        `https://lyricsplus.prjktla.my.id/v2/lyrics/get?${new URLSearchParams({
          title: trackName,
          artist: artistName,
          duration: duration.toFixed(2),
        }).toString()}`,
        {
          headers: {
            "X-User-Agent": "ADVOSC v0.0.7 (https://github.com/thearmagan/advosc)"
          }
        }
      );
      if (res.status === 200) {
        const data = await res.json() as LyricData;
        cache[cacheKey] = {
          at: Date.now(),
          data
        }
      } else {
        cache[cacheKey] = {
          at: Date.now(),
          data: null
        }
      }
    }
    return cache[cacheKey].data || null;
  }

  async getPlaceholderValue(placeholder: string): Promise<string> {


    switch (placeholder) {
      case "Status":
        if (!this.lastMediaInfo) return "Unknown";
        return this.lastMediaInfo.playbackStatus;
      case "Position": {
        if (!this.lastMediaInfo) return "0";
        const pos = this.getEstimatedPosition();
        return pos !== undefined ? Math.floor(pos * 1000).toString() : "0";
      }
      case "Duration":
        if (!this.lastMediaInfo) return "0";
        return this.lastMediaInfo.duration !== undefined ? Math.floor(this.lastMediaInfo.duration).toString() : "0";
      case "AppName":
        if (!this.lastMediaInfo) return "";
        return (this.lastMediaInfo.appName || "")?.replace(/\.exe$/i, "");
      case "Artist":
        if (!this.lastMediaInfo) return "";
        return this.lastMediaInfo.artist || "";
      case "Album":
        if (!this.lastMediaInfo) return "";
        return this.lastMediaInfo.album || "";
      case "Track":
        if (!this.lastMediaInfo) return "";
        return this.lastMediaInfo.title || "";
      case "Lyric":
        return this.getCurrentLyricLine();
      default:
        return "";
    }
  }
}