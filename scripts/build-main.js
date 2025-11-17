import esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

// Separate build configs so preload stays CommonJS (Electron expects CJS for preload)
const mainConfig = {
  entryPoints: ['src/main/main.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: 'dist/main.js',
  external: ['electron', 'osc'],
  sourcemap: true,
  minify: !watch,
  format: 'esm',
};

const preloadConfig = {
  entryPoints: ['src/main/preload.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: 'dist/preload.js',
  external: ['electron'],
  sourcemap: true,
  minify: !watch,
  format: 'cjs', // keep preload as CommonJS so Electron doesn't throw import syntax error
};

async function build() {
  if (watch) {
    const mainCtx = await esbuild.context(mainConfig);
    const preloadCtx = await esbuild.context(preloadConfig);
    await Promise.all([mainCtx.watch(), preloadCtx.watch()]);
    console.log('Watching for changes in main & preload...');
  } else {
    await Promise.all([esbuild.build(mainConfig), esbuild.build(preloadConfig)]);
    console.log('Main & preload built successfully!');
  }
}

build().catch(() => process.exit(1));
