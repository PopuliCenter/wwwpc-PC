import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.{test,spec}.ts', 'src/**/*.d.ts'],
      // Ambang MINIMUM (gate) — ditetapkan DI BAWAH nilai saat ini (Stmts 51.6 /
      // Branch 68.6 / Funcs 46.2 / Lines 51.6) sebagai buffer, agar perubahan
      // wajar tak bikin CI merah, tapi penurunan cakupan besar tetap tertangkap.
      // Naikkan bertahap seiring bertambahnya test.
      thresholds: {
        statements: 45,
        branches: 60,
        functions: 42,
        lines: 45,
      },
    },
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
