// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';

// https://astro.build/config
export default defineConfig({
  vite: {
    define: {
      global: 'globalThis',
      'process.env': '{}',
      'process.nextTick': '(cb, ...args) => Promise.resolve().then(() => cb(...args))',
      'process.browser': 'true',
    },
    resolve: {
      alias: {
        events: 'events/events.js',
      },
    },
    plugins: [tailwindcss()],
    server: {
      https: fs.existsSync('.cert/cert.pem') ? {
        key: fs.readFileSync('.cert/key.pem'),
        cert: fs.readFileSync('.cert/cert.pem'),
      } : undefined,
      host: true,
      proxy: {
        '/ws': {
          target: 'ws://localhost:3001',
          ws: true,
        },
      },
    },
  },
});