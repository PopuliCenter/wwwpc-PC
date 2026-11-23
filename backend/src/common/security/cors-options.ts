import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * Opsi CORS backend (dipakai main.ts). Dipisah agar perilakunya bisa diuji.
 *
 * - Tanpa header Origin → izinkan. CORS hanya mengatur request cross-origin
 *   browser; Origin kosong berarti bukan request semacam itu (same-origin lewat
 *   proxy nginx /api, healthcheck, server-ke-server, aplikasi native). Menolak
 *   mereka merusak app & healthcheck tanpa menambah keamanan (klien non-browser
 *   bisa memalsukan Origin).
 * - Origin di ALLOWED_ORIGINS → izinkan.
 * - Origin asing → TOLAK TANPA error (T-38): `callback(null, false)` membuat
 *   header Access-Control-Allow-* tidak dikirim sehingga browser memblokir
 *   respons. Dulu `callback(new Error())` → 500 + stack trace di log untuk
 *   setiap preflight asing (dan berjalan sebelum throttler).
 */
export function buildCorsOptions(allowedOrigins: string[]): CorsOptions {
  return {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  };
}
