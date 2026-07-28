// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  integrations: [react()],

  vite: {
    plugins: [tailwindcss()],
    server: {
      // File-change events don't cross the WSL/Windows (/mnt/c) boundary,
      // so HMR silently misses edits without polling
      watch: { usePolling: true }
    }
  }
});