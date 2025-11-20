import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  build: {
    ssr: true,
    target: 'node18',
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: path.resolve(__dirname, 'src/chromium/index.ts'),
      output: {
        entryFileNames: 'chromium.js',
        format: 'iife',
      },
    },
  },
});
