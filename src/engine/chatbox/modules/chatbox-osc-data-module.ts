import { moduleValues } from "../module-values";
import { oscDataOptions } from "$shared/chatbox/modules/osc-data";
import { avatarOSC } from "../../vrc-osc";
import { chatbox } from "..";
import { AppModule } from "$shared/chatbox/module-base";

export class OSCDataModule extends AppModule {
  constructor() {
    super(oscDataOptions, moduleValues("OSCData"));
  }

  async getPlaceholderValue(...params: string[]): Promise<string> {
    params = await chatbox.fillTemplates(params, "[[:]]", false, chatbox.getInstanceKey());
    const address = params[0];
    const idx = params[1] ? parseInt(params[1], 10) : 0;
    if (isNaN(idx) || idx < 0) {
      return `(Invalid index: ${params[1]})`;
    }
    return avatarOSC.allLastParameters[address]?.[idx]?.toString() ?? '0';
  }
}