import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { readFileSync } from 'fs';

// Versi web diambil dari package.json saat build (disuntik sbg __APP_VERSION__).
// Di native, versi dibaca dari versionName aplikasi via @capacitor/app.
const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')) as {
  version: string;
};

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    VitePWA({
      // Mode 'autoUpdate': service worker baru langsung skipWaiting + clientsClaim,
      // jadi REFRESH BIASA sudah menampilkan versi terbaru (tidak perlu hard
      // refresh). Tab yang masih terbuka juga otomatis dimuat ulang saat SW baru
      // aktif (lihat PWAReloadPrompt) — kecuali saat sedang mengisi survei.
      registerType: 'autoUpdate',
      // Registrasi SW hanya lewat useRegisterSW (PWAReloadPrompt), yang di-skip
      // di native. Tanpa ini, plugin menyuntik skrip auto-register ke index.html
      // sehingga SW tetap aktif di Capacitor → layar blank. null = jangan suntik.
      injectRegister: null,
      // Ikon di bawah ini digenerate docs/play-store/assets/generate-assets.js.
      manifest: {
        name: 'Riset Populi Center',
        short_name: 'Populi Center',
        lang: 'id',
        description: 'Survei opini publik dari Populi Center',
        theme_color: '#FFFFFF',
        background_color: '#F5F6F6',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // App-shell precache + fallback SPA agar aplikasi tetap dimuat offline.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Berkas sumber logo 5700x5699 tetap dilayani (dipakai template email backend),
        // tetapi tidak ikut precache; UI memakai varian 96 dan 192.
        globIgnores: ['**/node_modules/**/*', 'logo-populi-center.png'],
        runtimeCaching: [
          {
            // Cache GET data survei (mis. fill/numbers) agar bisa dibuka offline.
            urlPattern: ({ url, request }) =>
              request.method === 'GET' && url.pathname.startsWith('/api'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-get-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@services': path.resolve(__dirname, './src/services'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
