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

const LYRICS_CACHE_KEY = "ChatboxMediaModule;LyricsCache;V3";
const LEGACY_LYRICS_CACHE_KEYS = ["ChatboxMediaModule;LyricsCache", "ChatboxMediaModule;LyricsCache;V2"];
const LYRICS_CACHE_TTL = 1000 * 60 * 60 * 24 * 2;
// The API returns syllable-level data (~40KB/song). Only the fields below are
// kept, otherwise localStorage fills up and every write throws QuotaExceeded.
const LYRICS_CACHE_MAX_ENTRIES = 150;
const LYRIC_RETRY_DELAY = 1000 * 30;

export class ChatboxMediaInfoModule extends ChatboxModule {
  lastMediaInfo: MediaInfo | null = null;
  lastPositionUpdatedAt: number = 0;
  currentLyric: LyricData | null = null;
  lastLyricKey: string | null = null;
  lyricFetchQueue: Map<string, Promise<LyricData | null>> = new Map();
  lyricRetryAt: Map<string, number> = new Map();

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
      if (
        info.position !== this.lastMediaInfo?.position ||
        info.playbackStatus !== this.lastMediaInfo?.playbackStatus
      ) {
        this.lastPositionUpdatedAt = Date.now();
      };
      this.lastMediaInfo = info;
    });

    setInterval(() => this.cleanLyricData(), 1000 * 60 * 60 * 24);
    this.cleanLyricData();
  }

  cleanLyricData() {
    for (const key of LEGACY_LYRICS_CACHE_KEYS) localData.remove(key);
    const cache = this.readLyricsCache();
    const now = Date.now();
    for (const key in cache) {
      const entry = cache[key];
      if (!entry || typeof entry.at !== "number" || now - entry.at > LYRICS_CACHE_TTL) {
        delete cache[key];
      }
    }
    this.writeLyricsCache(cache);
  }

  readLyricsCache(): LyricsCache {
    const cache = localData.get(LYRICS_CACHE_KEY, {});
    return (cache && typeof cache === "object" && !Array.isArray(cache)) ? cache as LyricsCache : {};
  }

  /**
   * localStorage has a hard quota; a full store makes `set` throw. Evict the
   * oldest entries and retry rather than letting the write bubble up and break
   * lyric fetching entirely.
   */
  writeLyricsCache(cache: LyricsCache): void {
    let entries = Object.entries(cache).sort((a, b) => b[1].at - a[1].at);
    if (entries.length > LYRICS_CACHE_MAX_ENTRIES) entries = entries.slice(0, LYRICS_CACHE_MAX_ENTRIES);

    while (true) {
      try {
        localData.set(LYRICS_CACHE_KEY, Object.fromEntries(entries));
        return;
      } catch (error) {
        if (!entries.length) {
          console.error("Failed to persist lyrics cache:", error);
          try { localData.remove(LYRICS_CACHE_KEY); } catch { /* nothing else to do */ }
          return;
        }
        // Drop the oldest half and try again.
        entries = entries.slice(0, Math.floor(entries.length / 2));
      }
    }
  }

  getEstimatedPosition(): number | undefined {
    if (this.lastMediaInfo?.position === undefined || this.lastMediaInfo.position === null) return undefined;
    const position = this.lastMediaInfo.position / 1000;
    if (this.lastMediaInfo.playbackStatus !== "Playing") return position;
    const elapsed = (Date.now() - this.lastPositionUpdatedAt) / 1000;
    const estimated = position + elapsed;
    const duration = this.lastMediaInfo.duration;
    if (duration !== undefined && duration !== null && duration > 0) {
      return Math.min(estimated, duration / 1000);
    }
    return estimated;
  }

  getLyricKey(info: MediaInfo): string | null {
    if (!info.title || !info.artist) return null;
    if (info.duration === undefined || info.duration === null || !Number.isFinite(info.duration) || info.duration <= 0) return null;
    return `${info.title};${info.artist};${(info.duration / 1000).toFixed(2)}`;
  }

  fetchCurrentLyric(): LyricData | null {
    if (!this.lastMediaInfo) return null;
    const cacheKey = this.getLyricKey(this.lastMediaInfo);
    if (!cacheKey) return null;

    if (this.lastLyricKey === cacheKey) return this.currentLyric;

    // The track changed — drop the previous track's lyrics so they can't leak
    // into the new one while the new fetch is in flight.
    this.currentLyric = null;

    // If a fetch is already in progress for this key, wait for it instead of
    // starting a second one.
    if (this.lyricFetchQueue.has(cacheKey)) return null;

    // Back off after a failed lookup instead of hammering the API every tick.
    const retryAt = this.lyricRetryAt.get(cacheKey);
    if (retryAt !== undefined && Date.now() < retryAt) return null;
    this.lyricRetryAt.delete(cacheKey);

    const { title, artist, duration } = this.lastMediaInfo;

    const fetchPromise = this.fetchLyrics(title!, artist!, duration! / 1000).then((result) => {
      // Only apply if the user is still on the same track.
      const stillCurrent = this.lastMediaInfo ? this.getLyricKey(this.lastMediaInfo) === cacheKey : false;
      if (result && stillCurrent) {
        this.lastLyricKey = cacheKey;
        this.currentLyric = result;
      } else if (!result) {
        // No lyrics (yet) — leave lastLyricKey unset so it can be retried.
        this.lyricRetryAt.set(cacheKey, Date.now() + LYRIC_RETRY_DELAY);
      }
      return result;
    }).catch((error) => {
      console.error("Lyric fetch error:", error);
      this.lyricRetryAt.set(cacheKey, Date.now() + LYRIC_RETRY_DELAY);
      return null;
    }).finally(() => {
      this.lyricFetchQueue.delete(cacheKey);
    });

    this.lyricFetchQueue.set(cacheKey, fetchPromise);

    // Return null while the fetch is still running
    return null;
  }

  getCurrentLyricLine(): string {
    if (!this.lastMediaInfo || this.lastMediaInfo.playbackStatus !== "Playing") return "";
    const lyric = this.fetchCurrentLyric();
    if (!lyric?.lyrics?.length) return "";
    const position = this.getEstimatedPosition();
    if (position === undefined) return "";
    const currentTime = position * 1000;
    const currentLine = lyric.lyrics.find(l => currentTime >= l.time && currentTime <= l.time + l.duration);
    return currentLine?.text || "";
  }

  async fetchLyrics(trackName: string, artistName: string, duration: number): Promise<LyricData | null> {
    const cacheKey = encodeURIComponent(`${trackName};${artistName};${duration.toFixed(2)}`);
    const cached = this.readLyricsCache()[cacheKey];
    if (cached && typeof cached.at === "number" && Date.now() - cached.at <= LYRICS_CACHE_TTL) {
      return cached.data || null;
    }

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

    let data: LyricData | null = null;
    if (res.ok) {
      try {
        const json = await res.json() as LyricData;
        const lines = Array.isArray(json?.lyrics)
          ? json.lyrics
            // Strip syllabus/element/metadata — they're never read and would
            // blow the localStorage quota within ~100 songs.
            .map(l => ({ time: Number(l?.time), duration: Number(l?.duration), text: String(l?.text ?? "") }))
            .filter(l => Number.isFinite(l.time) && Number.isFinite(l.duration))
          : [];
        if (lines.length) data = { lyrics: lines };
      } catch (error) {
        console.error("Lyric parse error:", error);
      }
    } else if (res.status >= 500 || res.status === 429) {
      // Transient server-side failure — don't poison the cache with a miss.
      return null;
    }

    // Re-read the cache: another fetch may have written to it while awaiting.
    const cache = this.readLyricsCache();
    cache[cacheKey] = { at: Date.now(), data };
    this.writeLyricsCache(cache);
    return data;
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