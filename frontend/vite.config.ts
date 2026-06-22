import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
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
      includeAssets: ['logo-populi-center.png'],
      manifest: {
        name: 'Survei Populi',
        short_name: 'Survei Populi',
        description: 'Platform survei & pengumpulan data lapangan',
        theme_color: '#4f46e5',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/logo-populi-center.png', sizes: '192x192', type: 'image/png' },
          { src: '/logo-populi-center.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // App-shell precache + fallback SPA agar aplikasi tetap dimuat offline.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
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
