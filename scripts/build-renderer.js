import esbuild from 'esbuild';
import sveltePlugin from 'esbuild-svelte';
import path from 'node:path';
import sveltePreprocess from 'svelte-preprocess';
import fs from 'node:fs/promises';
import postcss from 'postcss';
import loadPostcssConfig from 'postcss-load-config';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const watch = process.argv.includes('--watch');

// Minimal PostCSS plugin to process CSS (Tailwind v4, autoprefixer etc.)
const postcssPlugin = {
  name: 'postcss',
  setup(build) {
    build.onLoad({ filter: /\.css$/ }, async (args) => {
      const source = await fs.readFile(args.path, 'utf8');
      let plugins = [];
      let options = {};
      try {
        const cfg = await loadPostcssConfig({}, path.dirname(args.path));
        plugins = cfg.plugins || [];
        options = cfg.options || {};
      } catch (err) {
        // No postcss config found; continue with empty plugins
      }
      const result = await postcss(plugins).process(source, {
        from: args.path,
        to: args.path,
        map: build.initialOptions.sourcemap ? { inline: false, annotation: false } : false,
        ...options,
      });
      return { contents: result.css, loader: 'css', resolveDir: path.dirname(args.path) };
    });
  },
};

const buildOptions = {
  entryPoints: ['src/renderer/main.ts'],
  bundle: true,
  platform: 'browser',
  target: 'es2022',
  outfile: 'dist/renderer.js',
  sourcemap: true,
  minify: !watch,
  conditions: ['style', 'browser', 'module', 'default'],
  alias: {
    '$lib': path.resolve(__dirname, '..', 'src', 'renderer', 'lib').replace(/\\/g, '/'),
  },
  plugins: [
    postcssPlugin,
    sveltePlugin({
      preprocess: sveltePreprocess({
        postcss: true,
        typescript: {
          tsconfigFile: './tsconfig.renderer.json',
        },
      }),
      compilerOptions: {
        css: 'injected',
        dev: watch,
      },
      filterWarnings: (warning) => {
        // Suppress certain warnings if needed
        return true;
      },
    }),
  ],
  loader: {
    '.svg': 'dataurl',
    '.png': 'dataurl',
    '.jpg': 'dataurl',
    '.css': 'css',
  },
};

async function build() {
  if (watch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('Watching for changes in renderer process...');
  } else {
    await esbuild.build(buildOptions);
    console.log('Renderer process built successfully!');
  }
}

build().catch(() => process.exit(1));
