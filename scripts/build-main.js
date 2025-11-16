import esbuild from 'esbuild';
import path from 'node:path';

const watch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: ['src/main/main.ts', 'src/main/preload.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outdir: 'dist',
  external: ['electron'],
  sourcemap: true,
  minify: !watch,
  format: 'esm',
};

async function build() {
  if (watch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('Watching for changes in main process...');
  } else {
    await esbuild.build(buildOptions);
    console.log('Main process built successfully!');
  }
}

build().catch(() => process.exit(1));
