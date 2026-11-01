import { AppModule } from "$shared/chatbox/module-base";
import { lovenseOptions } from "$shared/chatbox/modules/lovense";
import { moduleValues } from "../chatbox/module-values";
import { chatbox } from "../chatbox";
import { getToysState, getToySettings, requestPanic, toyService } from ".";

/** Reads only. Output goes through Automations, so no placeholder here can move a toy. */
export class LovenseModule extends AppModule {
  constructor() {
    super(lovenseOptions, moduleValues("Lovense"));
  }

  async getPlaceholderValue(key: string, ...params: string[]): Promise<string> {
    if (!getToySettings().enabled) return "";

    const toys = getToysState().toys.filter((toy) => toy.connected);
    switch (key) {
      case "Connected":
        return toys.length > 0 ? "true" : "false";
      case "ToyCount":
        return String(toys.length);
      case "Toys":
        return toys.map((toy) => toy.name).join(", ");
      case "Battery": {
        const [name] = await chatbox.fillTemplates(params, "[[:]]", false, chatbox.getInstanceKey());
        const wanted = name?.trim().toLowerCase();
        const levels = toys
          .filter((toy) => !wanted || toy.name.toLowerCase() === wanted)
          .map((toy) => toy.battery)
          .filter((battery): battery is number => battery !== null);
        return levels.length ? String(Math.min(...levels)) : "";
      }
      case "Status":
        if (toyService.isLatched()) return "Panic";
        return getToysState().paused ? "Paused" : "Ready";
      default:
        return "";
    }
  }

  async runInput(inputId: string) {
    if (!getToySettings().enabled) return;
    switch (inputId) {
      case "Panic":
        await requestPanic();
        return;
      case "Stop":
        await toyService.stopAll();
        return;
      default:
        throw new Error(`Module Lovense has no input ${inputId}`);
    }
  }
}
