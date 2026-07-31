import type { Writable } from "svelte/store";
import { get } from "svelte/store";
import type { ChatboxModule } from "../../chatbox-module";
import type { ChatboxHeartRateModule } from "../chatbox-heart-rate-module";

const UUIDRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** First parameter of an outer `{{Pulsoid;…}}` / inner `[[Pulsoid:…]]` placeholder. */
const OuterPulsoidRegex = /\{\{Pulsoid;([^;}]*)/g;
const InnerPulsoidRegex = /\[\[Pulsoid:([^:\]]*)/g;

function collectTokens(text: string, into: Set<string>) {
  if (!text) return;
  for (const regex of [OuterPulsoidRegex, InnerPulsoidRegex]) {
    regex.lastIndex = 0;
    for (const match of text.matchAll(regex)) {
      const arg = match[1].trim();
      if (UUIDRegex.test(arg)) into.add(arg);
    }
  }
}

function rewrite(text: string, names: Map<string, string>): string {
  if (!text) return text;
  return text
    .replace(OuterPulsoidRegex, (_, arg: string) => `{{HeartRate;${names.get(arg.trim()) ?? arg}`)
    .replace(InnerPulsoidRegex, (_, arg: string) => `[[HeartRate:${names.get(arg.trim()) ?? arg}`);
}

export interface PulsoidMigrationContext {
  heartRate: ChatboxHeartRateModule;
  modules: Map<string, ChatboxModule>;
  settings: Writable<{ template: string; [key: string]: any }>;
  advancedTemplate: Writable<string>;
  simpleEditorBlocks: Writable<any[]>;
}

/**
 * One-shot upgrade from the old Pulsoid-only module to the multi-platform Heart Rate
 * module: every raw token found in a saved template becomes a named Pulsoid source, and
 * the templates are rewritten to reference it by name.
 */
export function migratePulsoidTemplates(ctx: PulsoidMigrationContext): void {
  const { heartRate, modules, settings, advancedTemplate, simpleEditorBlocks } = ctx;

  const values = heartRate.getValues();
  if (values.migratedFromPulsoid) return;

  const shortcutModule = modules.get("Shortcut");
  const shortcuts: Record<string, string> = shortcutModule?.getValues()?.shortcuts || {};
  const blocks = get(simpleEditorBlocks);

  // ---- 1. find every raw token still referenced anywhere
  const tokens = new Set<string>();
  collectTokens(get(settings).template, tokens);
  collectTokens(get(advancedTemplate), tokens);
  for (const shortcut of Object.values(shortcuts)) collectTokens(shortcut, tokens);
  for (const block of blocks) {
    if (block?.type === "heartrate" && UUIDRegex.test((block.token || "").trim())) {
      tokens.add(block.token.trim());
    }
  }

  // Legacy values from the Pulsoid module never held tokens, so there is nothing to
  // import when no template mentions one — just mark the migration done.
  if (tokens.size === 0) {
    heartRate.values.set({ ...values, migratedFromPulsoid: true });
    return;
  }

  // ---- 2. create a named source per token
  const existingSources = { ...(values.sources || {}) };
  const names = new Map<string, string>();
  let counter = 1;
  for (const token of tokens) {
    const existing = Object.entries(existingSources).find(
      ([, source]: [string, any]) => source?.platform === "pulsoid" && source?.token === token,
    );
    if (existing) {
      names.set(token, existing[0]);
      continue;
    }
    let name = "Pulsoid";
    while (existingSources[name]) name = `Pulsoid ${++counter}`;
    existingSources[name] = { platform: "pulsoid", token };
    names.set(token, name);
  }

  heartRate.values.set({ ...values, sources: existingSources, migratedFromPulsoid: true });

  // ---- 3. rewrite everything that referenced the tokens
  settings.update((current) => ({ ...current, template: rewrite(current.template, names) }));
  advancedTemplate.update((current) => rewrite(current, names));

  if (shortcutModule) {
    const shortcutValues = shortcutModule.getValues();
    shortcutModule.values.set({
      ...shortcutValues,
      shortcuts: Object.fromEntries(
        Object.entries(shortcuts).map(([key, value]) => [key, rewrite(value, names)]),
      ),
    });
  }

  simpleEditorBlocks.update((current) =>
    current.map((block) => {
      if (block?.type !== "heartrate") return block;
      const token = (block.token || "").trim();
      const { token: _dropped, ...rest } = block;
      return { ...rest, source: names.get(token) ?? block.source ?? token };
    }),
  );

  console.log("Chatbox", `Migrated ${tokens.size} Pulsoid token(s) to named Heart Rate sources.`);
}
