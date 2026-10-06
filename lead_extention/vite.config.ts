import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  publicDir: 'public',
  build: {
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: resolve(dirname(fileURLToPath(import.meta.url)), 'sidepanel.html'),
        'background/service-worker': resolve(dirname(fileURLToPath(import.meta.url)), 'src/background/service-worker.ts'),
        'content/maps': resolve(dirname(fileURLToPath(import.meta.url)), 'src/content/maps.ts'),
        'workers/processing': resolve(dirname(fileURLToPath(import.meta.url)), 'src/workers/processing.worker.ts')
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  }
});
