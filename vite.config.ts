import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: [
        'favicon.svg',
        'icon-app.svg',
        'icon-maskable.svg',
        'icon-app-192.png',
        'icon-app-512.png',
        'icon-maskable-192.png',
        'icon-maskable-512.png',
      ],
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webp,woff2}'],
        // Blog-editor fonts and non-Latin UI subsets are fetched on demand, not precached.
        globIgnores: [
          '**/{dm-sans,lora}-*.woff2',
          '**/ibm-plex-sans-{cyrillic,cyrillic-ext,greek,vietnamese}-*.woff2',
        ],
      },
      manifest: {
        name: 'Reinigungs-Portal',
        short_name: 'Reinigungs-Portal',
        description:
          'Reinigungs-Portal — zentrale Admin-Konsole für Aufträge, Partner-Werkstätten und B2B-Vertrieb.',
        lang: 'de-DE',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#241c17',
        theme_color: '#241c17',
        categories: ['business', 'productivity'],
        shortcuts: [
          {
            name: 'Aufträge',
            short_name: 'Aufträge',
            description: 'Offene und laufende Aufträge',
            url: '/auftraege',
          },
          {
            name: 'Anfragen',
            short_name: 'Anfragen',
            description: 'Neue Service-Anfragen',
            url: '/inquiries',
          },
          {
            name: 'Aufgaben',
            short_name: 'Aufgaben',
            description: 'Meine offenen Aufgaben',
            url: '/tasks',
          },
        ],
        // Android Chrome needs 192+512 PNGs to be installable (SVG-only is not enough).
        // PNGs stay opaque edge-to-edge (launchers apply their own mask); the maskable pair carries ~30% safe-zone padding.
        icons: [
          {
            src: '/icon-app-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-app-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icon-app.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: '/icon-maskable.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query'],
        },
      },
    },
  },
});
