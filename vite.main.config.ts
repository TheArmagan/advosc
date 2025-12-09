import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  build: {
    ssr: true,
    target: 'node18',
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: path.resolve(__dirname, 'src/main/index.ts'),
      external: [
        'electron', 'path', 'fs', 'url', 'os', 'module', 'child_process', 'dgram', 'net', 'events',
        'chokidar', 'osc'
      ],
      output: {
        entryFileNames: 'main.cjs',
        format: 'cjs',
      },
    },
  },
});
