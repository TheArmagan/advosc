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
          description: "Formats the input text based on predefined formats (SuperScript, SmallCaps, Rounded, Bold, Italic, BoldItalic, Fullwidth, Fraktur, DoubleStruck, Strikethrough).",
          fillText: "Text;Format;${1:SuperScript|SmallCaps|Rounded|Bold|Italic|BoldItalic|Fullwidth|Fraktur|DoubleStruck|Strikethrough};${2:inputText}"
        },
        "Truncate": {
          value: "This is a ve...",
          description: "Truncates the input text to a specified length and appends ellipsis if necessary.",
          fillText: "Text;Truncate;${1:length};${2:inputText}"
        },
        "Build;ProgressBar": {
          value: "█████░░░░░",
          description: "Builds a progress bar based on current and total values. Optional 6th param is a head character shown at the fill boundary.",
          fillText: "Text;Build;ProgressBar;${1:currentValue};${2:totalValue};${3:length};${4:fillChar};${5:emptyChar};${6:headChar}"
        },
        "Build;StarRating": {
          value: "★★★☆☆",
          description: "Builds a star rating based on rating and maximum rating values.",
          fillText: "Text;Build;StarRating;${1:ratingValue};${2:maxRatingValue};${3:filledChar};${4:emptyChar}"
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
        },
        "Trim": {
          value: "hello world",
          description: "Removes leading and trailing whitespace from the text.",
          fillText: "Text;Trim;${1:inputText}"
        },
        "Replace": {
          value: "Hi World",
          description: "Replaces all occurrences of a substring with another in the text.",
          fillText: "Text;Replace;${1:searchText};${2:replaceText};${3:inputText}"
        },
        "Pad": {
          value: "   Hello",
          description: "Pads the text to a specified length on Left, Right, or Center.",
          fillText: "Text;Pad;${1:Left|Right|Center};${2:length};${3:padChar};${4:inputText}"
        },
        "WordCount": {
          value: "2",
          description: "Returns the number of words in the text.",
          fillText: "Text;WordCount;${1:inputText}"
        },
        "Capitalize": {
          value: "Hello world",
          description: "Capitalizes the first character of the text.",
          fillText: "Text;Capitalize;${1:inputText}"
        },
        "Build;HealthBar": {
          value: "♥♥♥♡♡",
          description: "Builds a health bar based on current and max values.",
          fillText: "Text;Build;HealthBar;${1:currentHP};${2:maxHP};${3:filledChar};${4:emptyChar}"
        },
        "Build;Toggle": {
          value: "ON",
          description: "Returns one of two texts based on a truthy/falsy value.",
          fillText: "Text;Build;Toggle;${1:value};${2:trueText};${3:falseText}"
        },
        "Animate;Typewriter": {
          value: "Hell",
          description: "Reveals the text character by character over time.",
          fillText: "Text;Animate;Typewriter;${1:inputText}"
        },
        "Animate;Blink": {
          value: "Hello",
          description: "Alternates between two texts at a set interval.",
          fillText: "Text;Animate;Blink;${1:text1};${2:text2}"
        },
        "Animate;Bounce": {
          value: " Hello",
          description: "Creates a left-right bouncing marquee effect.",
          fillText: "Text;Animate;Bounce;${1:inputText};${2:maxLength}"
        },
        "If": {
          value: "Text is not empty",
          description: "Returns trueText or falseText based on a condition (Empty, NotEmpty, Equals).",
          fillText: "Text;If;${1:Empty|NotEmpty|Equals};${2:inputText};${3:trueText};${4:falseText}"
        },
        "Default": {
          value: "fallback",
          description: "Returns the text if non-empty, otherwise the fallback value.",
          fillText: "Text;Default;${1:fallbackText};${2:inputText}"
        },
        "NumberFormat": {
          value: "1,234.56",
          description: "Formats a number with decimal places, decimal separator and thousands separator.",
          fillText: "Text;NumberFormat;${1:decimals};${2:decimalSeparator};${3:thousandsSeparator};${4:number}"
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
        const inputText = texts.join(";");
        if (formatKey === "Strikethrough") {
          return inputText.split("").join("\u0336") + "\u0336";
        }
        return mapReplace(inputText.toLowerCase(), textFormats[formatKey as keyof typeof textFormats] ?? {});
      }
      case "Truncate": {
        const [lengthStr, ...texts] = params;
        const length = Math.max(0, parseInt(lengthStr, 10) || 0);
        const text = texts.join(";");
        if (text.length <= length) return text;
        return text.slice(0, length) + "...";
      }
      case "Build": {
        const [buildType, ...args] = params;

        switch (buildType) {
          case "ProgressBar": {
            const [currentStr, totalStr, lengthStr, fillChar = "█", emptyChar = "░", headChar = ""] = args;
            const current = Math.max(0, parseInt(currentStr, 10) || 0);
            const total = Math.max(1, parseInt(totalStr, 10) || 1);
            const length = Math.max(1, parseInt(lengthStr, 10) || 10);
            const filledLength = Math.round((current / total) * length);
            const emptyLength = length - filledLength;
            if (headChar && filledLength > 0 && filledLength < length) {
              return fillChar.repeat(filledLength - 1) + headChar + emptyChar.repeat(emptyLength);
            }
            return fillChar.repeat(filledLength) + emptyChar.repeat(emptyLength);
          }
          case "StarRating": {
            const [ratingStr, maxRatingStr, filledChar = "★", emptyChar = "☆"] = args;
            const rating = Math.max(0, parseFloat(ratingStr) || 0);
            const maxRating = Math.max(1, parseFloat(maxRatingStr) || 1);
            const filledCount = Math.round((rating / maxRating) * maxRating);
            const emptyCount = maxRating - filledCount;
            return filledChar.repeat(filledCount) + emptyChar.repeat(emptyCount);
          }
          case "HealthBar": {
            const [currentStr, maxStr, filledChar = "♥", emptyChar = "♡"] = args;
            const current = Math.max(0, parseFloat(currentStr) || 0);
            const max = Math.max(1, parseFloat(maxStr) || 1);
            const totalBars = Math.round(max);
            const filledCount = Math.min(totalBars, Math.round((current / max) * totalBars));
            const emptyCount = totalBars - filledCount;
            return filledChar.repeat(filledCount) + emptyChar.repeat(emptyCount);
          }
          case "Toggle": {
            const [value, trueText = "ON", falseText = "OFF"] = args;
            const isTruthy = value && value !== "0" && value.toLowerCase() !== "false" && value.trim() !== "";
            return isTruthy ? trueText : falseText;
          }
        }
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
          case "Typewriter": {
            const [text] = args;
            const speed = 2200;
            const now = Date.now();
            if (data.last !== text) {
              data.at = now;
              data.index = 0;
              data.last = text;
            }
            const elapsed = now - data.at;
            const chars = Math.floor(elapsed / speed) % (text.length + 1);
            return text.slice(0, chars);
          }
          case "Blink": {
            const [text1, text2] = args;
            const speed = 2200;
            const step = Math.floor(Date.now() / speed) % 2;
            return step === 0 ? text1 : (text2 ?? "");
          }
          case "Bounce": {
            const [text, maxLengthStr] = args;
            const speed = 2200;
            const maxLength = maxLengthStr ? Math.max(1, parseInt(maxLengthStr, 10) || text.length) : text.length;
            const now = Date.now();
            if (data.last !== text) {
              data.at = now;
              data.index = 0;
              data.last = text;
            }
            const range = text.length - maxLength;
            if (range <= 0) return text;
            const totalSteps = range * 2;
            const elapsed = now - data.at;
            const step = Math.floor(elapsed / speed) % totalSteps;
            const pos = step <= range ? step : totalSteps - step;
            return text.slice(pos, pos + maxLength);
          }
        }
      }
      case "Trim": {
        const text = params.join(";");
        return text.trim();
      }
      case "Replace": {
        const [search, replace, ...texts] = params;
        return texts.join(";").split(search).join(replace);
      }
      case "Pad": {
        const [side, lengthStr, padChar, ...texts] = params;
        const length = Math.max(0, parseInt(lengthStr, 10) || 0);
        const text = texts.join(";");
        const char = (padChar || " ")[0];
        if (text.length >= length) return text;
        const padAmount = length - text.length;
        switch (side) {
          case "Left": return char.repeat(padAmount) + text;
          case "Right": return text + char.repeat(padAmount);
          case "Center": {
            const leftPad = Math.floor(padAmount / 2);
            const rightPad = padAmount - leftPad;
            return char.repeat(leftPad) + text + char.repeat(rightPad);
          }
          default: return text;
        }
      }
      case "WordCount": {
        const text = params.join(";").trim();
        return text ? text.split(/\s+/).length.toString() : "0";
      }
      case "Capitalize": {
        const text = params.join(";");
        return text.charAt(0).toUpperCase() + text.slice(1);
      }
      case "If": {
        const [conditionType, ...rest] = params;
        switch (conditionType) {
          case "Empty": {
            const [checkText, trueText = "", falseText = ""] = rest;
            return checkText.trim() === "" ? trueText : falseText;
          }
          case "NotEmpty": {
            const [checkText, trueText = "", falseText = ""] = rest;
            return checkText.trim() !== "" ? trueText : falseText;
          }
          case "Equals": {
            const [a, b, trueText = "", falseText = ""] = rest;
            return a === b ? trueText : falseText;
          }
        }
        return "";
      }
      case "Default": {
        const [fallback, ...texts] = params;
        const text = texts.join(";").trim();
        return text !== "" ? text : fallback;
      }
      case "NumberFormat": {
        const [decimalsStr, decSep = ".", thousSep = ",", ...nums] = params;
        const num = parseFloat(nums.join(";"));
        if (isNaN(num)) return "";
        const decimals = Math.max(0, parseInt(decimalsStr, 10) || 0);
        const [intPart, decPart = ""] = num.toFixed(decimals).split(".");
        const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousSep);
        return decimals > 0 ? formattedInt + decSep + decPart : formattedInt;
      }
    }
    return "";
  }
}