import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Builds the extension pages (side panel) and the background service worker.
// The content script needs a single self-contained IIFE, so it has its own
// config: vite.content.config.ts. `npm run build` runs both (scripts/build.mjs).
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  root: resolve(import.meta.dirname, 'src'),
  publicDir: resolve(import.meta.dirname, 'public'),
  base: './',
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    target: 'chrome116',
    sourcemap: mode === 'development' ? 'inline' : false,
    minify: mode !== 'development',
    modulePreload: { polyfill: false },
    rolldownOptions: {
      input: {
        sidepanel: resolve(import.meta.dirname, 'src/sidepanel/index.html'),
        background: resolve(import.meta.dirname, 'src/background/index.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
}));
