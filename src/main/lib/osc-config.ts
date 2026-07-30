import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { OSCSource } from './osc';

export interface OSCSourceConfig extends OSCSource {
  id: string;
  name: string;
  enabled: boolean;
}

const CONFIG_FILE_NAME = 'osc-sources.json';

export const DEFAULT_OSC_SOURCES: OSCSourceConfig[] = [
  {
    id: 'vrchat',
    name: 'VRChat',
    enabled: true,
    local: { address: '0.0.0.0', port: 9001 },
    remote: { address: '127.0.0.1', port: 9000 },
  },
  {
    id: 'secondary-listener',
    name: 'Secondary Listener',
    enabled: true,
    local: { address: '0.0.0.0', port: 9002 },
  },
];

function getConfigPath(): string {
  return path.join(app.getPath('userData'), CONFIG_FILE_NAME);
}

function isValidPort(port: unknown): port is number {
  return typeof port === 'number' && Number.isInteger(port) && port >= 1 && port <= 65535;
}

function sanitizeEndpoint(value: any): { address: string; port: number } | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const address = typeof value.address === 'string' ? value.address.trim() : '';
  if (!address) return undefined;
  if (!isValidPort(value.port)) return undefined;
  return { address, port: value.port };
}

/** Drops anything malformed instead of failing the whole config. */
export function sanitizeSources(value: any): OSCSourceConfig[] {
  if (!Array.isArray(value)) return [];
  const sources: OSCSourceConfig[] = [];
  const usedIds = new Set<string>();

  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;

    const local = sanitizeEndpoint(raw.local);
    const remote = sanitizeEndpoint(raw.remote);
    if (!local && !remote) continue;

    let id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `source-${sources.length + 1}`;
    while (usedIds.has(id)) id += '-1';
    usedIds.add(id);

    sources.push({
      id,
      name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : id,
      enabled: raw.enabled !== false,
      ...(local ? { local } : {}),
      ...(remote ? { remote } : {}),
    });
  }

  return sources;
}

export function loadOSCSources(): OSCSourceConfig[] {
  try {
    const configPath = getConfigPath();
    if (!fs.existsSync(configPath)) return [...DEFAULT_OSC_SOURCES];
    const text = fs.readFileSync(configPath, 'utf-8').replace(/﻿/g, '');
    const sources = sanitizeSources(JSON.parse(text));
    return sources.length ? sources : [...DEFAULT_OSC_SOURCES];
  } catch (error) {
    console.error('Failed to load OSC sources, falling back to defaults:', error);
    return [...DEFAULT_OSC_SOURCES];
  }
}

export function saveOSCSources(sources: OSCSourceConfig[]): void {
  const configPath = getConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(sources, null, 2), 'utf-8');
}

/** Only enabled sources are handed to the OSC instance. */
export function toActiveSources(sources: OSCSourceConfig[]): OSCSource[] {
  return sources
    .filter(source => source.enabled)
    .map(({ local, remote }) => ({
      ...(local ? { local } : {}),
      ...(remote ? { remote } : {}),
    }));
}
