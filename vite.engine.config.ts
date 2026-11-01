import { defineConfig } from 'vite';
import path from 'node:path';

// Everything except these gets bundled. `chokidar` stays external because it's the one real
// runtime dependency; `bufferutil` and `utf-8-validate` are optional speedups `ws` tries to
// load inside a try/catch and carries on without.
const external = ['electron', 'chokidar', 'bufferutil', 'utf-8-validate'];

export default defineConfig({
  resolve: {
    alias: {
      $shared: path.resolve(__dirname, 'src/shared'),
    },
  },
  ssr: {
    noExternal: true,
    external,
  },
  build: {
    ssr: true,
    target: 'node20',
    outDir: 'dist',
    emptyOutDir: false,
    minify: false,
    rollupOptions: {
      input: path.resolve(__dirname, 'src/engine/main.ts'),
      external,
      output: {
        entryFileNames: 'engine.cjs',
        format: 'cjs',
      },
    },
  },
});
