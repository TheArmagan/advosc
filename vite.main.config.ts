import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      $shared: path.resolve(__dirname, 'src/shared'),
    },
  },
  build: {
    ssr: true,
    target: 'node18',
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: path.resolve(__dirname, 'src/main/main.ts'),
      external: [
        'electron', 'path', 'fs', 'url', 'os', 'module', 'child_process', 'dgram', 'net', 'events',
        'chokidar'
      ],
      output: {
        entryFileNames: 'main.cjs',
        format: 'cjs',
      },
    },
  },
});
