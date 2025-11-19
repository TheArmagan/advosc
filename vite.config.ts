import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwind from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  base: './',
  plugins: [
    svelte({
      compilerOptions: {
        runes: true,
      },
    }),
    tailwind(),
  ],
  resolve: {
    alias: {
      $lib: path.resolve(__dirname, 'src/renderer/lib'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
  },
});
