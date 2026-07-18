import { readFileSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Ties the Workbox runtime cache for public/data/*.json to the pipeline's
// content hash (pipeline/emit.ts), so the browser cache invalidates only
// when the actual vocab/grammar data changes, not on every deploy.
const dataVersion: string = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, 'public/data/index.json'), 'utf-8'),
).dataVersion

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'kotoba',
        short_name: 'kotoba',
        description: '日文單字與文法學習 PWA',
        lang: 'zh-Hant',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#6b46c1',
        background_color: '#ffffff',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // App shell only — public/data/*.json is deliberately excluded
        // (no .json extension in this list) so it never enters the
        // precache; it's fetched and cached on demand instead (see
        // runtimeCaching below), since a user only ever needs the levels
        // they actually browse, not all ~26MB of vocab/grammar data.
        globPatterns: ['**/*.{js,css,html,ico,svg,png,woff,woff2}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/data/'),
            handler: 'CacheFirst',
            options: {
              cacheName: `kotoba-data-${dataVersion}`,
              expiration: { maxEntries: 20 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
