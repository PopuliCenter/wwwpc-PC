import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';
import path from 'path';

/**
 * Konfigurasi terpisah untuk E2E test (butuh Postgres + Redis NYATA).
 * Dijalankan lewat `npm run test:e2e` — TIDAK ikut pada `npm test` (unit,
 * semua pakai mock). Satu proses (singleFork) agar tak ada balapan skema/DB.
 */
export default defineConfig({
  test: {
    globals: true,
    root: './',
    environment: 'node',
    include: ['test/**/*.e2e-spec.ts'],
    setupFiles: ['test/e2e-env.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@modules': path.resolve(__dirname, './src/modules'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@config': path.resolve(__dirname, './src/config'),
    },
  },
});
