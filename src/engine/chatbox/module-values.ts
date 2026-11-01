import { synced } from "../sync/hub";

/** A module's persisted values. The key is a stored string and must not change. */
export function moduleValues(id: string) {
  return synced<Record<string, any>>(`ChatboxModuleValues;${id}`, {});
}
