import { chatbox } from "..";
import { ChatboxModule } from "../chatbox-module";
import { format } from "date-fns-tz";

export class ChatboxTimeModule extends ChatboxModule {
  constructor() {
    super({
      id: "Time",
      name: "Time",
      description: "Time and date utilities. Also supports formatting.",
      examplePlaceholders: {
        "NowMillis": {
          value: "1700000000000",
          description: "Returns the current time in milliseconds since the Unix epoch.",
          fillText: "Time;NowMillis"
        },
        "Now": {
          value: "2023-11-14 12:00:00+00:00",
          description: "Returns the current date and time formatted according to the specified format string and time zone.",
          fillText: "Time;Now;${1:yyyy-MM-dd HH:mm:ssXXX};${2:TimeZone}"
        },
        "Timestamp": {
          value: "2023-11-14 12:00:00+00:00",
          description: "Converts a given timestamp in milliseconds to a formatted date and time string.",
          fillText: "Time;Timestamp;${1:timestampMillis};${2:yyyy-MM-dd HH:mm:ssXXX};${3:TimeZone}"
        },
        "Format": {
          value: "2023-11-14 12:00:00+00:00",
          description: "Formats a given date string into the specified format and time zone.",
          fillText: "Time;Format;${1:dateString};${2:yyyy-MM-dd HH:mm:ssXXX};${3:TimeZone}"
        },
        "Timezone": {
          value: "America/New_York",
          description: "Returns the system's current time zone identifier.",
          fillText: "Time;Timezone"
        },
        "UTCOffset": {
          value: "+00:00",
          description: "Returns the current UTC offset of the system's time zone.",
          fillText: "Time;UTCOffset"
        },
        "FromNowMilis": {
          value: "60000",
          description: "Calculates the milliseconds from now until the specified future timestamp.",
          fillText: "Time;FromNowMilis;${1:futureTimestampMillis}"
        },
        "FormatDuration": {
          value: "1h 30m 0s",
          description: "Formats a duration in milliseconds into a human-readable string.",
          fillText: "Time;FormatDuration;${1:durationMillis};${2:Short|Long|Colon};${3:delimiter}"
        },
        "ElapsedMillis": {
          value: "5000",
          description: "Calculates the elapsed milliseconds since the specified start timestamp.",
          fillText: "Time;ElapsedMillis;${1:startTimestampMillis}"
        }
      }
    });
  }

  async getPlaceholderValue(key: string, ...params: string[]): Promise<string> {
    params = await chatbox.fillTemplates(params, "[[:]]");
    try {
      switch (key) {
        case "NowMillis": {
          return Date.now().toString();
        }
        case "Now": {
          const formatStr = params[0] || "yyyy-MM-dd HH:mm:ssXXX";
          const timeZone = params[1] || Intl.DateTimeFormat().resolvedOptions().timeZone;
          return format(new Date(), formatStr, { timeZone });
        }
        case "Timestamp": {
          const timestamp = parseInt(params[0] || "");
          if (isNaN(timestamp)) return "(Invalid timestamp)";
          const formatStr = params[1] || "yyyy-MM-dd HH:mm:ssXXX";
          const timeZone = params[2] || Intl.DateTimeFormat().resolvedOptions().timeZone;
          return format(new Date(timestamp), formatStr, { timeZone });
        }
        case "Format": {
          const dateStr = params[0] || "";
          const formatStr = params[1] || "yyyy-MM-dd HH:mm:ssXXX";
          const timeZone = params[2] || Intl.DateTimeFormat().resolvedOptions().timeZone;
          const date = dateStr ? new Date(dateStr) : new Date();
          if (isNaN(date.getTime())) return "(Invalid date)";
          return format(date, formatStr, { timeZone });
        }
        case "Timezone": {
          return Intl.DateTimeFormat().resolvedOptions().timeZone;
        }
        case "UTCOffset": {
          const date = new Date();
          const offsetMinutes = -date.getTimezoneOffset();
          const sign = offsetMinutes >= 0 ? "+" : "-";
          const hours = String(Math.floor(Math.abs(offsetMinutes) / 60)).padStart(2, "0");
          const minutes = String(Math.abs(offsetMinutes) % 60).padStart(2, "0");
          return `${sign}${hours}:${minutes}`;
        }
        case "FromNowMilis": {
          const futureTimestamp = parseInt(params[0] || "");
          if (isNaN(futureTimestamp)) return "(Invalid timestamp)";
          const now = Date.now();
          return (futureTimestamp - now).toString();
        }
        case "FormatDuration": {
          const millis = parseInt(params[0] || "");
          const format = params[1] || "Short" as "Long" | "Short" | "Colon";
          const delimiter = params[2] || (format === "Long" ? ", " : "");

          if (isNaN(millis)) return "(Invalid duration)";

          const absMillis = Math.abs(millis);
          const seconds = Math.floor((absMillis / 1000) % 60);
          const minutes = Math.floor((absMillis / (1000 * 60)) % 60);
          const hours = Math.floor((absMillis / (1000 * 60 * 60)) % 24);
          const days = Math.floor(absMillis / (1000 * 60 * 60 * 24));

          let parts: string[] = [];
          if (format === "Colon") {
            if (days > 0) parts.push(String(days));
            parts.push(String(hours).padStart(2, '0'));
            parts.push(String(minutes).padStart(2, '0'));
            parts.push(String(seconds).padStart(2, '0'));
            return parts.join(':');
          } else {
            if (days > 0) parts.push(`${days} ${format === "Long" ? (days === 1 ? "day" : "days") : "d"}`);
            if (hours > 0) parts.push(`${hours} ${format === "Long" ? (hours === 1 ? "hour" : "hours") : "h"}`);
            if (minutes > 0) parts.push(`${minutes} ${format === "Long" ? (minutes === 1 ? "minute" : "minutes") : "m"}`);
            if (seconds > 0 || parts.length === 0) parts.push(`${seconds} ${format === "Long" ? (seconds === 1 ? "second" : "seconds") : "s"}`);
            return parts.join(delimiter);
          }
        }
        case "ElapsedMillis": {
          const startTimestamp = parseInt(params[0] || "");
          if (isNaN(startTimestamp)) return "(Invalid timestamp)";
          const now = Date.now();
          return (now - startTimestamp).toString();
        }
      }
    } catch (e) {
      return `(Time error: ${e})`;
    }
    return "";
  }
}