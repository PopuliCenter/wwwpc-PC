import { describe, it, expect } from 'vitest';
import { assertSecretsSafe, weakSecretReason } from './auth.config';

/** Audit 23 Nov 2026 — T-05: boot gagal bila JWT_SECRET produksi lemah/placeholder. */
describe('assertSecretsSafe', () => {
  const STRONG = 'kQ8v2Lr9XzT4pW1nB7cY5mJ0hG3fD6sA-Ue_Ri'; // 38 char acak

  it('wajib ada JWT_SECRET di semua lingkungan', () => {
    expect(() => assertSecretsSafe({ NODE_ENV: 'development' })).toThrow(/JWT_SECRET/);
  });

  it('di luar produksi, secret pendek tetap diterima (dev/test)', () => {
    expect(() => assertSecretsSafe({ NODE_ENV: 'test', JWT_SECRET: 'dev' })).not.toThrow();
  });

  it.each([
    ['placeholder .env.example', 'ganti_jwt_secret_minimal_32_karakter_acak'],
    ['placeholder README', 'your-super-secret-jwt-key-change-in-production'],
    ['terlalu pendek', 'aB3$kL9!xZ'],
    ['variasi rendah', 'a'.repeat(40)],
  ])('produksi menolak secret lemah: %s', (_label, secret) => {
    expect(() => assertSecretsSafe({ NODE_ENV: 'production', JWT_SECRET: secret })).toThrow(
      /tidak aman untuk produksi/,
    );
  });

  it('produksi menerima secret acak ≥32 karakter', () => {
    expect(() => assertSecretsSafe({ NODE_ENV: 'production', JWT_SECRET: STRONG })).not.toThrow();
  });

  it('produksi juga memeriksa OTP_HASH_SECRET bila diset', () => {
    expect(() =>
      assertSecretsSafe({ NODE_ENV: 'production', JWT_SECRET: STRONG, OTP_HASH_SECRET: 'pendek' }),
    ).toThrow(/OTP_HASH_SECRET/);
  });

  it('weakSecretReason null untuk secret kuat', () => {
    expect(weakSecretReason(STRONG)).toBeNull();
  });
});
