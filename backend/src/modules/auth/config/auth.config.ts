import { registerAs } from '@nestjs/config';

export interface AuthConfig {
  jwtSecret: string;
  jwtAccessExpiresIn: string;
  jwtRefreshExpiresIn: string;
  sessionTtl: number; // seconds
}

/** Panjang minimum secret penandatangan JWT/HMAC di produksi. */
export const MIN_SECRET_LENGTH = 32;

/**
 * Pola nilai contoh yang terpublikasi (README, .env.example) atau jelas belum
 * diganti. Secret produksi yang cocok pola ini ditolak saat boot (audit T-05).
 */
const PLACEHOLDER_PATTERNS: RegExp[] = [
  /ganti/i,
  /your[-_ ]?/i,
  /change[-_ ]?(me|in|this)/i,
  /changeme/i,
  /placeholder/i,
  /example/i,
  /replace[-_ ]?me/i,
  /do[-_ ]?not[-_ ]?use/i,
  /^(secret|password|jwt[-_]?secret)$/i,
];

/**
 * Kembalikan alasan penolakan bila `value` tidak layak dipakai sebagai secret
 * produksi, atau null bila layak.
 */
export function weakSecretReason(value: string): string | null {
  if (value.length < MIN_SECRET_LENGTH) {
    return `lebih pendek dari ${MIN_SECRET_LENGTH} karakter`;
  }
  if (PLACEHOLDER_PATTERNS.some((re) => re.test(value))) {
    return 'masih berupa nilai contoh/placeholder';
  }
  if (new Set(value).size < 8) {
    return 'terlalu sedikit variasi karakter';
  }
  return null;
}

/**
 * Validasi secret saat boot. Di produksi, JWT_SECRET (dan OTP_HASH_SECRET bila
 * diset) wajib acak & ≥32 karakter; di luar produksi cukup tidak kosong.
 */
export function assertSecretsSafe(env: NodeJS.ProcessEnv = process.env): void {
  const jwtSecret = env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error(
      'JWT_SECRET environment variable is not set. ' +
        'Set a strong random secret before starting the application.',
    );
  }
  if (env.NODE_ENV !== 'production') return;

  const checks: Array<[string, string | undefined]> = [
    ['JWT_SECRET', jwtSecret],
    ['OTP_HASH_SECRET', env.OTP_HASH_SECRET],
  ];
  for (const [name, value] of checks) {
    if (value === undefined || value === '') continue;
    const reason = weakSecretReason(value);
    if (reason) {
      throw new Error(
        `${name} tidak aman untuk produksi (${reason}). Buat nilai acak, mis. ` +
          '`openssl rand -base64 48`, lalu jalankan ulang. Mengganti JWT_SECRET ' +
          'akan mengeluarkan semua pengguna.',
      );
    }
  }
}

export const authConfig = registerAs('auth', (): AuthConfig => {
  assertSecretsSafe();
  const jwtSecret = process.env.JWT_SECRET as string;

  return {
    jwtSecret,
    jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '60m',
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    sessionTtl: parseInt(process.env.SESSION_TTL || '604800', 10), // 7 days in seconds
  };
});
