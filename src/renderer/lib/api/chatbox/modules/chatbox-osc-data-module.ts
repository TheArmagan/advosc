import { avatarOSC } from "$lib/api/vrc-osc";
import { chatbox } from "..";
import { ChatboxModule } from "../chatbox-module";

export class ChatboxOSCDataModule extends ChatboxModule {
  constructor() {
    super({
      id: "OSCData",
      name: "OSC Data",
      description: "Provides raw OSC data received by the application.",
      examplePlaceholders: {
        "/avatar/parameters/SomeParameter": {
          value: "1",
          description: "The value of the OSC parameter at address /avatar/parameters/SomeParameter.",
          fillText: "OSCData;${1:/avatar/parameters/SomeParameter};${2:optionalIndex}"
        }
      }
    });
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