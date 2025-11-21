import { chatbox } from "..";
import { ChatboxModule } from "../chatbox-module";
import * as textFormats from "$lib/data/text-formats.json";
import mapReplace from "stuffs/lib/mapReplace";

export class ChatboxTextModule extends ChatboxModule {
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
        }
      }
    });
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
    }
    return "";
  }
}