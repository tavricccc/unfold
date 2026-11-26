import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const appSrc = path.resolve(here, '../../app/src').replace(/\\/g, '/');

// The film runs the real app, with one swap: its backend (src/api.ts) is replaced by a scripted one.
export default defineConfig({
  root: here,
  base: './',
  plugins: [
    react(),
    {
      name: 'promo-api',
      enforce: 'pre',
      resolveId(id, importer) {
        if (importer && importer.replace(/\\/g, '/').startsWith(appSrc) && /^\.\.?\/api$/.test(id)) return path.resolve(here, 'src/promo-api.ts').replace(/\\/g, '/');
      },
    },
  ],
  resolve: { alias: { '@app': appSrc } },
  build: {
    outDir: process.env.FILM_OUT ?? 'R:/unfold-video/dist', emptyOutDir: true, chunkSizeWarningLimit: 4000,
    rollupOptions: { input: { film: path.resolve(here, 'film.html'), app: path.resolve(here, 'app.html') } },
  },
});
