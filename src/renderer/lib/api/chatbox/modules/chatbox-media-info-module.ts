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

interface LrclibRecord {
  duration?: number | null;
  instrumental?: boolean;
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
}

type LyricsCache = Record<string, { at: number; data: LyricData | null }>;

const LRCLIB_HEADERS = {
  // Browsers won't let us set User-Agent, so LRCLIB's identification header
  // goes through the X- variant.
  "X-User-Agent": "ADVOSC v0.0.7 (https://github.com/thearmagan/advosc)"
};

const LYRICS_CACHE_KEY = "ChatboxMediaModule;LyricsCache;V4";
const LEGACY_LYRICS_CACHE_KEYS = ["ChatboxMediaModule;LyricsCache", "ChatboxMediaModule;LyricsCache;V2", "ChatboxMediaModule;LyricsCache;V3"];
const LYRICS_CACHE_TTL = 1000 * 60 * 60 * 24 * 2;
// LRCLIB returns the whole LRC file as one string. It's parsed down to the
// fields below before caching, otherwise localStorage fills up and every write
// throws QuotaExceeded.
const LYRICS_CACHE_MAX_ENTRIES = 150;
// How long the last line of a song stays on screen when the track duration is
// unknown.
const LYRIC_LAST_LINE_DURATION = 8;
// How far a search result's duration may be off the playing track, in seconds.
const LYRIC_SEARCH_DURATION_TOLERANCE = 5;
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

    const { title, artist, album, duration } = this.lastMediaInfo;

    const fetchPromise = this.fetchLyrics(title!, artist!, duration! / 1000, album || undefined).then((result) => {
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

  /**
   * LRCLIB gives synced lyrics as a plain LRC file: one `[mm:ss.xx] text` line
   * per lyric, sometimes with several timestamps sharing the same text, plus
   * `[ar:...]`-style metadata tags that are skipped. Each line runs until the
   * next one starts.
   */
  parseLrc(lrc: string, trackDuration: number): LyricData["lyrics"] {
    const lines: LyricData["lyrics"] = [];

    for (const rawLine of lrc.split(/\r?\n/)) {
      const stamps = [...rawLine.matchAll(/\[(\d+):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];
      if (!stamps.length) continue;
      const text = rawLine.slice(stamps[stamps.length - 1][0].length + stamps[stamps.length - 1].index!).trim();
      for (const stamp of stamps) {
        const minutes = Number(stamp[1]);
        const seconds = Number(stamp[2]);
        const fraction = stamp[3] ? Number(stamp[3]) / Math.pow(10, stamp[3].length) : 0;
        const time = minutes * 60 + seconds + fraction;
        if (!Number.isFinite(time)) continue;
        lines.push({ time: Math.round(time * 1000), duration: 0, text });
      }
    }

    lines.sort((a, b) => a.time - b.time);

    for (let i = 0; i < lines.length; i++) {
      const next = lines[i + 1];
      const end = next
        ? next.time
        : (trackDuration > 0 ? trackDuration * 1000 : lines[i].time + LYRIC_LAST_LINE_DURATION * 1000);
      lines[i].duration = Math.max(0, end - lines[i].time);
    }

    // Instrumental gaps come through as empty lines; they only exist to end the
    // previous line, so they're dropped after the durations are computed.
    return lines.filter(l => l.text.length > 0);
  }

  /**
   * Fallback for when the exact lookup misses. Returns the LRC of the synced
   * result whose duration is closest to the track, within a few seconds.
   */
  async searchLyrics(trackName: string, artistName: string, duration: number): Promise<string | null> {
    const res = await fetch(
      `https://lrclib.net/api/search?${new URLSearchParams({
        track_name: trackName,
        artist_name: artistName,
      }).toString()}`,
      { headers: LRCLIB_HEADERS }
    );
    if (!res.ok) return null;

    let results: LrclibRecord[] = [];
    try {
      const json = await res.json();
      if (Array.isArray(json)) results = json as LrclibRecord[];
    } catch (error) {
      console.error("Lyric search parse error:", error);
      return null;
    }

    const best = results
      .filter(r => r?.syncedLyrics && typeof r.duration === "number")
      .map(r => ({ record: r, delta: Math.abs((r.duration as number) - duration) }))
      .sort((a, b) => a.delta - b.delta)[0];

    if (!best || best.delta > LYRIC_SEARCH_DURATION_TOLERANCE) return null;
    return best.record.syncedLyrics || null;
  }

  async fetchLyrics(trackName: string, artistName: string, duration: number, albumName?: string): Promise<LyricData | null> {
    const cacheKey = encodeURIComponent(`${trackName};${artistName};${duration.toFixed(2)}`);
    const cached = this.readLyricsCache()[cacheKey];
    if (cached && typeof cached.at === "number" && Date.now() - cached.at <= LYRICS_CACHE_TTL) {
      return cached.data || null;
    }

    const query: Record<string, string> = {
      artist_name: artistName,
      track_name: trackName,
      duration: Math.round(duration).toString(),
    };
    if (albumName) query.album_name = albumName;

    const res = await fetch(
      `https://lrclib.net/api/get?${new URLSearchParams(query).toString()}`,
      { headers: LRCLIB_HEADERS }
    );

    let synced: string | null = null;
    if (res.ok) {
      try {
        const json = await res.json() as LrclibRecord;
        synced = json?.syncedLyrics || null;
      } catch (error) {
        console.error("Lyric parse error:", error);
      }
    } else if (res.status >= 500 || res.status === 429) {
      // Transient server-side failure — don't poison the cache with a miss.
      return null;
    } else {
      // /api/get only answers on an exact track/artist/album match with the
      // duration within a couple of seconds, so a 404 is common. Search instead
      // and pick the closest result.
      synced = await this.searchLyrics(trackName, artistName, duration);
    }

    let data: LyricData | null = null;
    if (synced) {
      const lines = this.parseLrc(synced, duration);
      if (lines.length) data = { lyrics: lines };
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