import { moduleValues } from "../module-values";
import { textOptions } from "$shared/chatbox/modules/text";
import { chatbox } from "..";
import { AppModule } from "$shared/chatbox/module-base";
import * as textFormats from "$shared/chatbox/text-formats.json";

const MAX_HEALTH_SYMBOLS = 20;

export class TextModule extends AppModule {
  animationData: Map<string, { at: number, index: number, last: string, lastUsed: number }> = new Map();

  constructor() {
    super(textOptions, moduleValues("Text"));

    // Drop state for placeholders that are no longer part of any template. Keyed on last
    // access, not on `at`: `at` is the animation start time, so using it would wipe (and
    // therefore restart) any animation that has been running for more than a minute.
    setInterval(() => {
      this.animationData.forEach((data, key) => {
        if (Date.now() - data.lastUsed > 60000) this.animationData.delete(key);
      });
    }, 60000);
  }



  async getPlaceholderValue(...params: string[]): Promise<string> {
    const instanceKey = chatbox.getInstanceKey();
    params = await chatbox.fillTemplates(params, "[[:]]", false, instanceKey);
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
        const map = textFormats[formatKey as keyof typeof textFormats] as Record<string, string> | undefined;
        if (!map) return inputText.toLowerCase();
        // Per character, so a style with capital glyphs keeps the case and one without them
        // falls back to its lowercase glyph like it always did.
        return Array.from(inputText, (ch) => map[ch] ?? map[ch.toLowerCase()] ?? ch.toLowerCase()).join("");
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
            // Floats, so a 0 to 1 avatar parameter fills the bar instead of rounding to 0.
            const total = parseFloat(totalStr) > 0 ? parseFloat(totalStr) : 1;
            const current = Math.min(total, Math.max(0, parseFloat(currentStr) || 0));
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
            const maxRating = Math.max(1, Math.round(parseFloat(maxRatingStr) || 1));
            const rating = Math.min(maxRating, Math.max(0, parseFloat(ratingStr) || 0));
            const filledCount = Math.round(rating);
            const emptyCount = maxRating - filledCount;
            return filledChar.repeat(filledCount) + emptyChar.repeat(emptyCount);
          }
          case "HealthBar": {
            const [currentStr, maxStr, filledChar = "♥", emptyChar = "♡"] = args;
            const max = parseFloat(maxStr) > 0 ? parseFloat(maxStr) : 1;
            const current = Math.min(max, Math.max(0, parseFloat(currentStr) || 0));
            // One symbol per point reads well for 5 hearts, not for 200 HP, so big maxes scale down.
            const totalBars = Math.min(MAX_HEALTH_SYMBOLS, Math.max(1, Math.round(max)));
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
        return "";
      }
      case "Animate": {
        const [animationType, ...args] = params;
        // Include the placeholder occurrence in the key so the very same animated
        // placeholder can be used multiple times in one template (or the same shortcut
        // expanded twice) with each copy animating on its own state.
        const dataKey = `${instanceKey}|${params.join(";")}`;
        let data = this.animationData.get(dataKey);
        if (!data) {
          data = { at: Date.now(), index: 0, last: "", lastUsed: Date.now() };
          this.animationData.set(dataKey, data);
        }
        data.lastUsed = Date.now();
        switch (animationType) {
          case "Marquee": {
            const [text, direction, maxLengthStr, paddingFlag] = args;
            const speed = 2200;
            const maxLength = maxLengthStr ? Math.max(1, parseInt(maxLengthStr, 10) || text.length) : text.length;
            const noPadding = paddingFlag !== "Padding";
            const now = Date.now();

            if (noPadding && text.trimEnd().length <= maxLength) return text.trimEnd();

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
              const doubledText = text.repeat(Math.ceil(maxLength / text.length) + 1);
              const offset = direction === "Right" ? (text.length - currentIndex) % text.length : currentIndex;
              displayText = doubledText.slice(offset, offset + maxLength);
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
          case "MarqueeCustom": {
            const [text = "", direction, maxLengthStr, stepStr] = args;
            // Code points, not UTF-16 units, so a skip never splits an emoji in half.
            const chars = Array.from(text);
            if (!chars.length) return "";
            const speed = 2200;
            const maxLength = Math.max(1, parseInt(maxLengthStr, 10) || chars.length);
            const skip = Math.max(1, parseInt(stepStr, 10) || 1);
            const now = Date.now();

            // Text that already fits has nothing to scroll. Trailing spaces are the loop gap.
            const fitted = Array.from(text.trimEnd());
            if (fitted.length <= maxLength) return fitted.join("");

            if (data.last !== text) {
              data.at = now;
              data.index = 0;
              data.last = text;
            }

            const frame = Math.floor((now - data.at) / speed);
            const moved = (frame * skip) % chars.length;
            const offset = direction === "Right" ? (chars.length - moved) % chars.length : moved;

            // Seamless loop: repeat enough copies that the window never runs off the end.
            const copies = Math.ceil((offset + maxLength) / chars.length);
            const looped: string[] = [];
            for (let i = 0; i < copies; i++) looped.push(...chars);
            return looped.slice(offset, offset + maxLength).join("");
          }
          case "EachOne": {
            const parts = args;
            if (!parts.length) return "";
            const speed = 2200;
            const now = Date.now();
            const signature = parts.join(" ");
            // Advance on elapsed time rather than on call count, so being evaluated more
            // than once per render (or not at all for a while) doesn't skew the cycle.
            if (data.last !== signature) {
              data.at = now;
              data.index = 0;
              data.last = signature;
            }
            data.index = Math.floor((now - data.at) / speed) % parts.length;
            return parts[data.index];
          }
          case "EachOneCustom": {
            const parts = args;
            if (!parts.length) return "";
            const speed = 2200;
            const now = Date.now();
            const signature = parts.join(" ");
            if (data.last !== signature) {
              data.at = now;
              data.index = 0;
              data.last = signature;
            }
            const entries = parts.map((part) => {
              const sep = part.indexOf(":");
              const intervalStr = sep === -1 ? part : part.slice(0, sep);
              return {
                duration: Math.max(1, parseInt(intervalStr, 10) || 1) * speed,
                item: sep === -1 ? "" : part.slice(sep + 1)
              };
            });
            const totalDuration = entries.reduce((acc, e) => acc + e.duration, 0);
            let elapsed = (now - data.at) % totalDuration;
            for (let i = 0; i < entries.length; i++) {
              if (elapsed < entries[i].duration) {
                data.index = i;
                return entries[i].item;
              }
              elapsed -= entries[i].duration;
            }
            data.index = 0;
            return entries[0].item;
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
        return "";
      }
      case "Wrap": {
        // Prefix and suffix only when there's something to wrap, so labels don't dangle.
        const [prefix = "", suffix = "", ...texts] = params;
        const text = texts.join(";");
        return text.trim() === "" ? "" : prefix + text + suffix;
      }
      case "Join": {
        // item;sep;item;sep;item. An empty item takes the separator in front of it along.
        let output = "";
        for (let i = 0; i < params.length; i += 2) {
          const item = params[i] ?? "";
          if (item.trim() === "") continue;
          output += (output ? params[i - 1] ?? "" : "") + item;
        }
        return output;
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