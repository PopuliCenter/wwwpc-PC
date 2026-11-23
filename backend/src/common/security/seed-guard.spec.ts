import { describe, it, expect } from 'vitest';
import { assertSeedAllowed, isSeedAllowed } from './seed-guard';

/** Audit 23 Nov 2026 — T-01: skrip seed menolak berjalan di produksi. */
describe('seed-guard', () => {
  it('diizinkan di luar produksi', () => {
    expect(isSeedAllowed({ NODE_ENV: 'development' })).toBe(true);
    expect(isSeedAllowed({})).toBe(true);
  });

  it('ditolak di produksi tanpa override', () => {
    expect(isSeedAllowed({ NODE_ENV: 'production' })).toBe(false);
    expect(() => assertSeedAllowed('seed-x', { NODE_ENV: 'production' })).toThrow(
      /ALLOW_SEED_IN_PRODUCTION/,
    );
  });

  it('override eksplisit harus persis "true"', () => {
    expect(isSeedAllowed({ NODE_ENV: 'production', ALLOW_SEED_IN_PRODUCTION: '1' })).toBe(false);
    expect(isSeedAllowed({ NODE_ENV: 'production', ALLOW_SEED_IN_PRODUCTION: 'true' })).toBe(true);
  });
});
