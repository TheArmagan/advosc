import { moduleValues } from "../module-values";
import { timeOptions } from "$shared/chatbox/modules/time";
import { chatbox } from "..";
import { AppModule } from "$shared/chatbox/module-base";
import { format } from "date-fns-tz";

export class TimeModule extends AppModule {
  constructor() {
    super(timeOptions, moduleValues("Time"));
  }

  async getPlaceholderValue(key: string, ...params: string[]): Promise<string> {
    params = await chatbox.fillTemplates(params, "[[:]]", false, chatbox.getInstanceKey());
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
          if (isNaN(timestamp)) return "";
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
          if (isNaN(futureTimestamp)) return "";
          const now = Date.now();
          return (futureTimestamp - now).toString();
        }
        case "FormatDuration": {
          const millis = parseInt(params[0] || "");
          const format = params[1] || "Short" as "Long" | "Short" | "Colon";
          const delimiter = params[2] || (format === "Long" ? ", " : "");

          if (isNaN(millis)) return "";

          const absMillis = Math.abs(millis);
          const seconds = Math.floor((absMillis / 1000) % 60);
          const minutes = Math.floor((absMillis / (1000 * 60)) % 60);
          const hours = Math.floor((absMillis / (1000 * 60 * 60)) % 24);
          const days = Math.floor(absMillis / (1000 * 60 * 60 * 24));

          let parts: string[] = [];
          if (format === "Clock") {
            // Media player style: 3:25, or 1:02:03 once there are hours.
            const totalHours = Math.floor(absMillis / (1000 * 60 * 60));
            const sign = millis < 0 ? "-" : "";
            const mm = totalHours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
            return `${sign}${totalHours > 0 ? `${totalHours}:` : ""}${mm}:${String(seconds).padStart(2, "0")}`;
          }
          if (format === "Colon") {
            if (days > 0) parts.push(String(days));
            if (hours > 0) parts.push(String(hours).padStart(2, '0'));
            parts.push(String(minutes).padStart(2, '0'));
            parts.push(String(seconds).padStart(2, '0'));
            return parts.join(':');
          } else {
            if (days > 0) parts.push(`${days}${format === "Long" ? (days === 1 ? " day" : " days") : "d"}`);
            if (hours > 0) parts.push(`${hours}${format === "Long" ? (hours === 1 ? " hour" : " hours") : "h"}`);
            if (minutes > 0) parts.push(`${minutes}${format === "Long" ? (minutes === 1 ? " minute" : " minutes") : "m"}`);
            if (seconds > 0 || parts.length === 0) parts.push(`${seconds}${format === "Long" ? (seconds === 1 ? " second" : " seconds") : "s"}`);
            return parts.join(delimiter);
          }
        }
        case "ElapsedMillis": {
          const startTimestamp = parseInt(params[0] || "");
          if (isNaN(startTimestamp)) return "";
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