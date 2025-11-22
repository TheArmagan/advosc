import { avatarOSC } from "$lib/api/vrc-osc";
import { chatbox } from "..";
import { ChatboxModule } from "../chatbox-module";

export class ChatboxNumberModule extends ChatboxModule {
  constructor() {
    super({
      id: "Number",
      name: "Number",
      description: "",
      examplePlaceholders: {
        "Random;Int;Min;Max": {
          value: "42",
          description: "Generates a random integer between Min and Max (inclusive).",
          fillText: "Number;Random;Int;${1:Min};${2:Max}"
        },
        "Random;Float;Min;Max": {
          value: "3.14",
          description: "Generates a random float between Min and Max.",
          fillText: "Number;Random;Float;${1:Min};${2:Max}"
        },
        "Clamp;Value;Min;Max": {
          value: "10",
          description: "Clamps the Value between Min and Max.",
          fillText: "Number;Clamp;${1:Value};${2:Min};${3:Max}"
        },
        "Map;Value;InMin;InMax;OutMin;OutMax": {
          value: "0.5",
          description: "Maps the Value from the range InMin-InMax to the range OutMin-OutMax.",
          fillText: "Number;Map;${1:Value};${2:InMin};${3:InMax};${4:OutMin};${5:OutMax}"
        },
        "Floor;Value": {
          value: "3",
          description: "Returns the largest integer less than or equal to Value.",
          fillText: "Number;Floor;${1:Value}"
        },
        "Ceil;Value": {
          value: "4",
          description: "Returns the smallest integer greater than or equal to Value.",
          fillText: "Number;Ceil;${1:Value}"
        },
        "Round;Value": {
          value: "3",
          description: "Rounds Value to the nearest integer.",
          fillText: "Number;Round;${1:Value}"
        },
        "Abs;Value": {
          value: "5",
          description: "Returns the absolute value of Value.",
          fillText: "Number;Abs;${1:Value}"
        }
      }
    });
  }

  async getPlaceholderValue(...params: string[]): Promise<string> {
    params = await chatbox.fillTemplates(params, "[[:]]");
    const key = params.shift();

    switch (key) {
      case "Random": {
        const type = params[0];
        const min = parseFloat(params[1]);
        const max = parseFloat(params[2]);
        if (type === "Int") {
          const result = Math.floor(Math.random() * (max - min + 1)) + min;
          return result.toString();
        } else if (type === "Float") {
          const result = Math.random() * (max - min) + min;
          return result.toString();
        }
        break;
      }
      case "Clamp": {
        const value = parseFloat(params[0]);
        const min = parseFloat(params[1]);
        const max = parseFloat(params[2]);
        const result = Math.min(Math.max(value, min), max);
        return result.toString();
      }
      case "Map": {
        const value = parseFloat(params[0]);
        const inMin = parseFloat(params[1]);
        const inMax = parseFloat(params[2]);
        const outMin = parseFloat(params[3]);
        const outMax = parseFloat(params[4]);
        const result = ((value - inMin) / (inMax - inMin)) * (outMax - outMin) + outMin;
        return result.toString();
      }
      case "Floor": {
        const value = parseFloat(params[0]);
        const result = Math.floor(value);
        return result.toString();
      }
      case "Ceil": {
        const value = parseFloat(params[0]);
        const result = Math.ceil(value);
        return result.toString();
      }
      case "Round": {
        const value = parseFloat(params[0]);
        const result = Math.round(value);
        return result.toString();
      }
      case "Abs": {
        const value = parseFloat(params[0]);
        const result = Math.abs(value);
        return result.toString();
      }
    }

    return "";
  }
}