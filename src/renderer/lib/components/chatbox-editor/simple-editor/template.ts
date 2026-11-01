import { chatbox } from "$lib/api/chatbox";
import type { ChatboxShortcutModule } from "$lib/api/chatbox/modules/chatbox-shortcut-module";

export { buildTemplateState, previewBlock, supportsSourceInput } from "$shared/simple-editor/template";

export function getUserShortcutNames() {
  const module = chatbox.modules.get("Shortcut") as ChatboxShortcutModule | undefined;
  return module
    ? Object.keys(module.getValues().shortcuts ?? {}).filter((key) => !key.startsWith("__SE_"))
    : [];
}

export function getShortcutParamCount(name: string) {
  const module = chatbox.modules.get("Shortcut") as ChatboxShortcutModule | undefined;
  return module ? module.getMaxParamCount(name) : 0;
}
