import { Transform } from 'class-transformer';

/**
 * Normalisasi email: trim + lowercase. Dipakai di semua DTO ber-email agar
 * penyimpanan & pencarian konsisten (email bersifat case-insensitive di praktik).
 * Tanpa ini, "Budi@Gmail.com" dan "budi@gmail.com" jadi dua akun berbeda dan
 * login/reset bisa gagal karena beda huruf besar-kecil.
 */
export const NormalizeEmail = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value));
