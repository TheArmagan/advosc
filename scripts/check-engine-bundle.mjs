// Fails the build if dist/engine.cjs requires anything that won't exist at runtime. The engine
// is bundled, and forge prunes every devDependency, so a stray require() only shows up as a
// crash in the packaged app. Nothing else catches that.

import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { resolve } from 'node:path';

const bundlePath = resolve(import.meta.dirname, '..', 'dist', 'engine.cjs');
const allowed = new Set([
  ...builtinModules,
  'electron',
  'chokidar',
  // Optional speedups for `ws`, loaded inside a try/catch.
  'bufferutil',
  'utf-8-validate',
]);

const source = readFileSync(bundlePath, 'utf-8');
const required = new Set(
  [...source.matchAll(/\brequire\(\s*["'`]([^"'`]+)["'`]\s*\)/g)].map((match) => match[1]),
);

const bad = [...required]
  .map((name) => name.replace(/^node:/, ''))
  .filter((name) => !allowed.has(name) && !allowed.has(name.split('/')[0]));

// The engine has no Svelte plugin and no DOM. If either got in, a shared module picked up a
// renderer import.
const forbidden = ['svelte/store', 'svelte-sonner', '.svelte"', 'window.ADVOSCNative'].filter(
  (text) => source.includes(text),
);

if (bad.length || forbidden.length) {
  if (bad.length) console.error(`dist/engine.cjs requires packages that aren't shipped: ${bad.join(', ')}`);
  if (forbidden.length) console.error(`dist/engine.cjs contains renderer code: ${forbidden.join(', ')}`);
  process.exit(1);
}

console.log(`dist/engine.cjs OK (${required.size} requires: ${[...required].sort().join(', ')})`);
