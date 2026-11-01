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
      input: path.resolve(__dirname, 'src/main/preload.ts'),
      external: ['electron', 'path', 'fs', 'url'],
      output: {
        entryFileNames: 'preload.cjs',
        format: 'cjs',
      },
    },
  },
});
