import { createHmac, timingSafeEqual } from 'crypto';

/**
 * OTP penukaran poin disimpan sebagai HMAC-SHA256, bukan plaintext (audit T-13):
 * kebocoran baris DB/respons API tak lagi memberi kode yang bisa dipakai. Kunci
 * HMAC: `OTP_HASH_SECRET` bila diset, selain itu `JWT_SECRET` (selalu ada di
 * produksi — boot gagal tanpanya). OTP diikat ke id redemption agar hash tak
 * bisa dipakai ulang lintas penukaran.
 */
function otpHashKey(): string {
  return process.env.OTP_HASH_SECRET || process.env.JWT_SECRET || '';
}

export function hashRedemptionOtp(redemptionId: string, code: string): string {
  return createHmac('sha256', otpHashKey()).update(`${redemptionId}:${code}`).digest('hex');
}

/** Bandingkan OTP masukan dengan hash tersimpan secara timing-safe. */
export function redemptionOtpMatches(
  redemptionId: string,
  provided: string | null | undefined,
  storedHash: string | null | undefined,
): boolean {
  if (!storedHash || !provided) return false;
  const a = Buffer.from(hashRedemptionOtp(redemptionId, provided), 'utf8');
  const b = Buffer.from(storedHash, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
