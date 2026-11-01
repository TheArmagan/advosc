import { ENGINE_CONFIG_ENV, type EngineConfig } from "$shared/engine-protocol";

function readConfig(): EngineConfig {
  const raw = process.env[ENGINE_CONFIG_ENV];
  if (!raw) throw new Error(`${ENGINE_CONFIG_ENV} is not set. The engine can only be started by main.`);
  return JSON.parse(raw) as EngineConfig;
}

export const engineConfig = readConfig();
