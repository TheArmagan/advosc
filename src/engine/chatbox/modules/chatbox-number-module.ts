import { moduleValues } from "../module-values";
import { numberOptions } from "$shared/chatbox/modules/number";
import { chatbox } from "..";
import { ChatboxModule } from "$shared/chatbox/module-base";

export class ChatboxNumberModule extends ChatboxModule {
  constructor() {
    super(numberOptions, moduleValues("Number"));
  }

  async getPlaceholderValue(...params: string[]): Promise<string> {
    params = await chatbox.fillTemplates(params, "[[:]]", false, chatbox.getInstanceKey());
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