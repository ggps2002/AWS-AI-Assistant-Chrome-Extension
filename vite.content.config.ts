import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Content scripts can't be ES modules, so the tour UI is bundled into a single
// IIFE (React included). CSS is imported with `?inline` and injected into the
// tour's shadow root, so nothing leaks into or out of the AWS console's styles.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  publicDir: false,
  // Library mode leaves process.env alone; React reads NODE_ENV at runtime.
  define: { 'process.env.NODE_ENV': JSON.stringify(mode === 'development' ? 'development' : 'production') },
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: false,
    target: 'chrome116',
    sourcemap: mode === 'development' ? 'inline' : false,
    minify: mode !== 'development',
    lib: {
      entry: resolve(import.meta.dirname, 'src/content/index.tsx'),
      name: 'AwsAssistantTour',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
  },
}));
