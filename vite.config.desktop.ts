/**
 * Vite config for the Electron desktop build.
 *
 * Key differences from vite.config.ts:
 *  - base: './'   → loads assets relative to the HTML file (needed for file://)
 *  - No dev-server PORT/BASE_PATH requirements
 *  - Output goes to dist-electron/renderer/ (packaged by electron-builder)
 */

import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(import.meta.dirname, '..', '..', 'attached_assets'),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist-electron/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      // Make sure the entry HTML ends up at the root of the output dir
      input: path.resolve(import.meta.dirname, 'index.html'),
    },
  },
});
