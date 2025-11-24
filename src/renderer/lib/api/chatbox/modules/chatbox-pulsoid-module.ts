import { chatbox } from "..";
import { ChatboxModule } from "../chatbox-module";
import PulsoidSocket from '@pulsoid/socket';

const UUIDRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ChatboxPulsoidModule extends ChatboxModule {
  sockets = new Map<string, PulsoidSocket>();
  lastHeartRates = new Map<string, number>();
  isOnlineMap = new Map<string, boolean>();

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
        }
      }
    });
  }

  private getOrCreateSocket(authToken: string): PulsoidSocket {
    if (!this.sockets.has(authToken)) {
      const socket = new PulsoidSocket(authToken);

      socket.on('heart-rate', (data) => {
        this.isOnlineMap.set(authToken, true);
        this.lastHeartRates.set(authToken, data.heartRate);
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

  async getPlaceholderValue(authToken: string, key: string): Promise<string> {
    [authToken, key] = await chatbox.fillTemplates([authToken, key], "[[:]]");

    if (!authToken || !UUIDRegex.test(authToken)) {
      return "(No auth token provided)";
    }

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
      default:
        return "";
    }
  }

  dispose() {
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
  }
}