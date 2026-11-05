import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const wrapClassicContentScript = (): Plugin => ({
  name: 'wrap-classic-content-script',
  generateBundle(_options, bundle) {
    const entry = bundle['content/maps.js'];
    if (!entry || entry.type !== 'chunk') throw new Error('The Maps content-script bundle was not generated.');
    if (entry.imports.length || entry.dynamicImports.length) throw new Error('Manifest V3 classic content scripts cannot contain ESM imports.');
    entry.code = `(() => {\n${entry.code}\n})();\n`;
  }
});

export default defineConfig({
  plugins: [react(), wrapClassicContentScript()],
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
