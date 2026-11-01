import type { ChatboxModuleOptions } from "../module-base";

export const timeOptions: ChatboxModuleOptions = {
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
};
