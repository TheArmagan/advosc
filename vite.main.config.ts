import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  build: {
    ssr: true,
    target: 'node18',
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: path.resolve(__dirname, 'src/main/main.ts'),
      external: [
        'electron', 'path', 'fs', 'url', 'os', 'module',
        'chokidar', 'osc'
      ],
      output: {
        entryFileNames: 'main.js',
        format: 'esm',
      },
    },
  },
});
