import { AUTOMATIONS_KEY, type Automation } from "$shared/automation";
import { synced } from "../sync/hub";

/**
 * On its own so the chatbox module can reach the rules for import and export. The automation
 * engine imports the chatbox module, so it can't be imported back from there.
 */
export const rulesStore = synced<Automation[]>(AUTOMATIONS_KEY, [], (stored) => (Array.isArray(stored) ? stored : []));
