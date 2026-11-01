import { ShortcutConfig } from "$shared/chatbox/modules/shortcut";
import { moduleValues } from "../module-client";

export class ShortcutModule extends ShortcutConfig {
  constructor() {
    super(moduleValues("Shortcut"));
  }
}
