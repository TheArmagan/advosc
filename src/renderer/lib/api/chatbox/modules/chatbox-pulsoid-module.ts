import { chatbox } from "..";
import { ChatboxModule } from "../chatbox-module";
import PulsoidSocket from '@pulsoid/socket';

const UUIDRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface HeartRateEntry {
  timestamp: number;
  heartRate: number;
}

export class ChatboxPulsoidModule extends ChatboxModule {
  sockets = new Map<string, PulsoidSocket>();
  lastHeartRates = new Map<string, number>();
  isOnlineMap = new Map<string, boolean>();
  heartRateHistory = new Map<string, HeartRateEntry[]>();
  allTimeMax = new Map<string, number>();
  allTimeMin = new Map<string, number>();
  lastAccessTime = new Map<string, number>();
  inactivityCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super({
      id: "Pulsoid",
      name: "Pulsoid",
      description: "Provides access to Pulsoid user data such as heart rate.",
      examplePlaceholders: {
        "Token;HeartRate": {
          value: "75",
          description: "The current heart rate of the user from Pulsoid.",
          fillText: "Pulsoid;${1:authToken};HeartRate"
        },
        "Token;IsOnline": {
          value: "true",
          description: "Indicates whether the Pulsoid user is currently online.",
          fillText: "Pulsoid;${1:authToken};IsOnline"
        },
        "Token;AverageHR;Seconds": {
          value: "72",
          description: "The average heart rate over the specified duration in seconds (default: 300 = 5 minutes). Max 900 seconds.",
          fillText: "Pulsoid;${1:authToken};AverageHR;${2:300}"
        },
        "Token;MaxHR": {
          value: "120",
          description: "The all-time maximum heart rate recorded this session.",
          fillText: "Pulsoid;${1:authToken};MaxHR"
        },
        "Token;MinHR": {
          value: "55",
          description: "The all-time minimum heart rate recorded this session.",
          fillText: "Pulsoid;${1:authToken};MinHR"
        }
      }
    });

    // Start inactivity check interval
    this.inactivityCheckInterval = setInterval(() => this.checkInactiveTokens(), 15000);
  }

  private checkInactiveTokens() {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const fifteenMinutesAgo = now - 15 * 60 * 1000;

    for (const [token, lastAccess] of this.lastAccessTime.entries()) {
      if (lastAccess < oneMinuteAgo) {
        this.disconnectToken(token);
      } else {
        // Clean up old heart rate history entries to prevent memory leaks
        const history = this.heartRateHistory.get(token);
        if (history) {
          const filteredHistory = history.filter(entry => entry.timestamp >= fifteenMinutesAgo);
          if (filteredHistory.length === 0) {
            this.heartRateHistory.delete(token);
          } else {
            this.heartRateHistory.set(token, filteredHistory);
          }
        }
      }
    }
  }

  private disconnectToken(authToken: string) {
    const socket = this.sockets.get(authToken);
    if (socket) {
      try {
        socket.disconnect();
      } catch (e) {
        console.error('Error closing Pulsoid socket:', e);
      }
    }
    this.sockets.delete(authToken);
    this.lastHeartRates.delete(authToken);
    this.isOnlineMap.delete(authToken);
    this.heartRateHistory.delete(authToken);
    this.allTimeMax.delete(authToken);
    this.allTimeMin.delete(authToken);
    this.lastAccessTime.delete(authToken);
  }

  private getOrCreateSocket(authToken: string): PulsoidSocket {
    if (!this.sockets.has(authToken)) {
      const socket = new PulsoidSocket(authToken);

      socket.on('heart-rate', (data) => {
        this.isOnlineMap.set(authToken, true);
        this.lastHeartRates.set(authToken, data.heartRate);

        // Track heart rate history for averaging
        const now = Date.now();
        const history = this.heartRateHistory.get(authToken) || [];
        history.push({ timestamp: now, heartRate: data.heartRate });
        
        // Keep only last 5 minutes of data
        const fiveMinutesAgo = now - 15 * 60 * 1000;
        const filteredHistory = history.filter(entry => entry.timestamp >= fiveMinutesAgo);
        this.heartRateHistory.set(authToken, filteredHistory);

        // Update all-time max
        const currentMax = this.allTimeMax.get(authToken);
        if (currentMax === undefined || data.heartRate > currentMax) {
          this.allTimeMax.set(authToken, data.heartRate);
        }

        // Update all-time min
        const currentMin = this.allTimeMin.get(authToken);
        if (currentMin === undefined || data.heartRate < currentMin) {
          this.allTimeMin.set(authToken, data.heartRate);
        }
      });

      socket.on('online', () => {
        this.isOnlineMap.set(authToken, true);
      });

      socket.on('offline', () => {
        this.isOnlineMap.set(authToken, false);
      });

      socket.on('error', (error: any) => {
        console.error('Pulsoid socket error:', error);
        this.isOnlineMap.set(authToken, false);
      });

      socket.on('close', () => {
        this.isOnlineMap.set(authToken, false);
      });

      // Automatically connect
      socket.connect();

      this.sockets.set(authToken, socket);
    }
    return this.sockets.get(authToken)!;
  }

  async getPlaceholderValue(authToken: string, key: string, ...args: string[]): Promise<string> {
    [authToken, key, ...args] = await chatbox.fillTemplates([authToken, key, ...args], "[[:]]");

    if (!authToken || !UUIDRegex.test(authToken)) {
      return "(No auth token provided)";
    }

    // Update last access time for this token
    this.lastAccessTime.set(authToken, Date.now());

    this.getOrCreateSocket(authToken);

    switch (key) {
      case "HeartRate": {
        const heartRate = this.lastHeartRates.get(authToken);
        return heartRate !== undefined ? heartRate.toString() : "0";
      }
      case "IsOnline": {
        const isOnline = this.isOnlineMap.get(authToken);
        return isOnline !== undefined ? isOnline.toString() : "false";
      }
      case "AverageHR": {
        const history = this.heartRateHistory.get(authToken);
        if (!history || history.length === 0) return "0";

        const seconds = parseInt(args[0]) || 300; // Default to 300 seconds (5 minutes)
        const cutoffTime = Date.now() - seconds * 1000;
        const relevantHistory = history.filter(entry => entry.timestamp >= cutoffTime);

        if (relevantHistory.length === 0) return "0";
        const sum = relevantHistory.reduce((acc, entry) => acc + entry.heartRate, 0);
        return Math.round(sum / relevantHistory.length).toString();
      }
      case "MaxHR": {
        const max = this.allTimeMax.get(authToken);
        return max !== undefined ? max.toString() : "0";
      }
      case "MinHR": {
        const min = this.allTimeMin.get(authToken);
        return min !== undefined ? min.toString() : "0";
      }
      default:
        return "";
    }
  }

  dispose() {
    // Clear the inactivity check interval
    if (this.inactivityCheckInterval) {
      clearInterval(this.inactivityCheckInterval);
      this.inactivityCheckInterval = null;
    }

    // Clean up all sockets when the module is destroyed
    for (const [token, socket] of this.sockets.entries()) {
      try {
        socket.disconnect();
      } catch (e) {
        console.error('Error closing Pulsoid socket:', e);
      }
    }
    this.sockets.clear();
    this.lastHeartRates.clear();
    this.isOnlineMap.clear();
    this.heartRateHistory.clear();
    this.allTimeMax.clear();
    this.allTimeMin.clear();
    this.lastAccessTime.clear();
  }
}