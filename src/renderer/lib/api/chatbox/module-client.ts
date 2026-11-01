import { ChatboxModule, type ChatboxModuleOptions } from "$shared/chatbox/module-base";
import { synced } from "../engine";

export function moduleValues(id: string) {
  return synced<Record<string, any>>(`ChatboxModuleValues;${id}`, {});
}

/** A module with no settings of its own. It only exists here to be listed. */
export class ChatboxModuleClient extends ChatboxModule {
  constructor(options: ChatboxModuleOptions) {
    super(options, moduleValues(options.id));
  }
}
