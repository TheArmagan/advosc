import { chatbox } from "..";
import { ChatboxModule } from "../chatbox-module";
import * as textFormats from "$lib/data/text-formats.json";
import mapReplace from "stuffs/lib/mapReplace";

export class ChatboxTextModule extends ChatboxModule {
  animationData: Map<string, { at: number, index: number, last: string }> = new Map();

  constructor() {
    super({
      id: "Text",
      name: "Text",
      description: "Text manipulation utilities.",
      examplePlaceholders: {
        "Upper": {
          value: "HELLO WORLD",
          description: "Converts the input text to uppercase.",
          fillText: "Text;Upper;${1:inputText}"
        },
        "Lower": {
          value: "hello world",
          description: "Converts the input text to lowercase.",
          fillText: "Text;Lower;${1:inputText}"
        },
        "Title": {
          value: "Hello World",
          description: "Converts the input text to title case.",
          fillText: "Text;Title;${1:inputText}"
        },
        "Length": {
          value: "11",
          description: "Returns the length of the input text.",
          fillText: "Text;Length;${1:inputText}"
        },
        "Reverse": {
          value: "dlroW olleH",
          description: "Reverses the input text.",
          fillText: "Text;Reverse;${1:inputText}"
        },
        "Repeat": {
          value: "Hello Hello Hello ",
          description: "Repeats the input text a specified number of times.",
          fillText: "Text;Repeat;${1:3};${2:inputText}"
        },
        "Slice": {
          value: "lo Wo",
          description: "Extracts a section of the input text.",
          fillText: "Text;Slice;${1:startIndex};${2:endIndex};${3:inputText}"
        },
        "Format": {
          value: "ⓡⓞⓤⓝⓓⓔⓓ ⓣⓔⓧⓣ",
          description: "Formats the input text based on predefined formats (SuperScript, SmallCaps, Rounded).",
          fillText: "Text;Format;${1:SuperScript|SmallCaps|Rounded};${2:inputText}"
        },
        "Truncate": {
          value: "This is a ve...",
          description: "Truncates the input text to a specified length and appends ellipsis if necessary.",
          fillText: "Text;Truncate;${1:length};${2:inputText}"
        },
        "Animate;Marquee": {
          value: "Hello World Hello World ",
          description: "Creates a marquee animation effect for the input text. Specify direction (Left or Right), and maximum visible length. Default is NoPadding mode.",
          fillText: "Text;Animate;Marquee;${1:inputText};${2:Left|Right};${3:maxLength}"
        },
        "Animate;EachOne": {
          value: "Hello",
          description: "Animates list of texts by displaying each one sequentially.",
          fillText: "Text;Animate;EachOne;${3:inputText};${4:inputText...}"
        },
        "Animate;EachOneCustom": {
          value: "Hello",
          description: "Animates list of texts by displaying each one sequentially with custom intervals. (interval in int * 2200ms)",
          fillText: "Text;Animate;EachOneCustom;${3:intervalInt:item1};${4:intervalInt:item2};${5:...}"
        }
      }
    });

    setInterval(() => {
      this.animationData.forEach((data, key) => {
        if (Date.now() - data.at > 60000) this.animationData.delete(key);
      });
    }, 60000);
  }



  async getPlaceholderValue(...params: string[]): Promise<string> {
    params = await chatbox.fillTemplates(params, "[[:]]");
    const key = params.shift();

    switch (key) {
      case "Upper": {
        const text = params.join(";");
        return text.toUpperCase();
      }
      case "Lower": {
        const text = params.join(";");
        return text.toLowerCase();
      }
      case "Title": {
        const text = params.join(";");
        return text.replace(
          /\w\S*/g,
          (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase()
        );
      }
      case "Length": {
        const text = params.join(";");
        return text.length.toString();
      }
      case "Reverse": {
        const text = params.join(";");
        return text.split("").reverse().join("");
      }
      case "Repeat": {
        const [count, ...texts] = params;
        const cnt = Math.max(0, parseInt(count, 10) || 0);
        return texts.join(";").repeat(cnt);
      }
      case "Slice": {
        const [startStr, endStr, ...texts] = params;
        const start = parseInt(startStr, 10);
        const end = endStr ? parseInt(endStr, 10) : undefined;
        return texts.join(";").slice(start, end);
      }
      case "Format": {
        const [formatKey, ...texts] = params;
        return mapReplace(texts.join(";").toLowerCase(), textFormats[formatKey as keyof typeof textFormats] ?? {});
      }
      case "Truncate": {
        const [lengthStr, ...texts] = params;
        const length = Math.max(0, parseInt(lengthStr, 10) || 0);
        const text = texts.join(";");
        if (text.length <= length) return text;
        return text.slice(0, length) + "...";
      }
      case "Animate": {
        const [animationType, ...args] = params;
        const dataKey = params.join(";");
        let data = this.animationData.get(dataKey);
        if (!data) {
          data = { at: Date.now(), index: 0, last: "" };
          this.animationData.set(dataKey, data);
        }
        switch (animationType) {
          case "Marquee": {
            const [text, direction, maxLengthStr, paddingFlag] = args;
            const speed = 2200;
            const maxLength = maxLengthStr ? Math.max(1, parseInt(maxLengthStr, 10) || text.length) : text.length;
            const noPadding = paddingFlag !== "Padding";
            const now = Date.now();

            if (data.last !== text) {
              data.at = now;
              data.index = 0;
              data.last = text;
            }

            const elapsed = now - data.at;
            const step = Math.floor(elapsed / speed);
            const cycleLength = noPadding ? text.length : text.length + maxLength;
            const currentIndex = step % cycleLength;

            let displayText = "";

            if (noPadding) {
              // Seamless loop without padding
              const doubledText = text.repeat(2);
              displayText = doubledText.slice(currentIndex, currentIndex + maxLength);
            } else {
              // With padding animation
              if (direction === "Left") {
                if (currentIndex < maxLength) {
                  // Padding phase
                  const padding = " ".repeat(currentIndex);
                  displayText = padding;
                } else {
                  // Text reveal phase
                  const textStartIdx = currentIndex - maxLength;
                  const textEndIdx = Math.min(textStartIdx + maxLength, text.length);
                  displayText = text.slice(textStartIdx, textEndIdx);
                }
              } else {
                // Right direction
                if (currentIndex < maxLength) {
                  // Padding phase
                  const padding = " ".repeat(currentIndex);
                  displayText = padding;
                } else {
                  // Text reveal phase
                  const textEndIdx = text.length - (currentIndex - maxLength);
                  const textStartIdx = Math.max(0, textEndIdx - maxLength);
                  displayText = text.slice(textStartIdx, textEndIdx);
                }
              }
            }

            return displayText;
          }
          case "EachOne": {
            const parts = args;
            data.index = (data.index + 1) % parts.length;
            data.at = Date.now();
            return parts[data.index];
          }
          case "EachOneCustom": {
            const parts = args;
            let totalInterval = 0;
            for (let i = 0; i < parts.length; i++) {
              const [intervalStr, item] = parts[i].split(":");
              const interval = Math.max(1, parseInt(intervalStr, 10) || 1);
              totalInterval += interval * 2200;
              if (Date.now() - data.at < totalInterval) {
                if (data.index !== i) {
                  data.index = i;
                  data.at = Date.now();
                }
                return item;
              }
            }
            // If exceeded total interval, reset to first item
            data.index = 0;
            data.at = Date.now();
            return parts[0]?.split(":")?.[1] || "";
          }
        }
      }
    }
    return "";
  }
}