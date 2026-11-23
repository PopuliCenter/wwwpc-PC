/**
 * Satu-satunya cara membaca IP klien di backend (T-07/T-18 audit 23 Nov 2026).
 *
 * JANGAN membaca `X-Forwarded-For` / `X-Real-IP` sendiri: entri paling kiri
 * dikendalikan penuh oleh klien (Cloudflare & nginx hanya MENAMBAHKAN ke
 * kanan). `req.ip` dari Express sudah memperhitungkan `trust proxy`
 * (TRUST_PROXY_HOPS di main.ts): ia mengambil entri ke-N dari kanan, yaitu
 * alamat yang ditulis oleh proxy tepercaya terluar.
 *
 * Prefiks IPv4-mapped (`::ffff:1.2.3.4`) dibuang agar allowlist & audit log
 * konsisten.
 */
export function clientIp(req: unknown, fallback = 'unknown'): string {
  const r = req as
    | { ip?: string; socket?: { remoteAddress?: string }; connection?: { remoteAddress?: string } }
    | undefined;
  const raw = r?.ip || r?.socket?.remoteAddress || r?.connection?.remoteAddress || '';
  if (!raw) return fallback;
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
}

/**
 * Nilai `trust proxy` Express dari env TRUST_PROXY_HOPS.
 *
 * Aman bila env kosong/tidak valid: default 1 hop (hanya nginx survei_frontend
 * di depan backend yang dipercaya), sehingga XFF kiriman klien TIDAK pernah
 * dipercaya mentah. Nilai `true` / daftar CIDR sengaja tidak didukung: `true`
 * berarti memercayai SELURUH rantai XFF (bisa dipalsukan).
 */
export function resolveTrustProxyHops(raw: string | undefined): number {
  const n = Number.parseInt((raw ?? '').trim(), 10);
  if (!Number.isFinite(n) || n < 0) return 1;
  // Batas atas defensif — rantai produksi paling panjang 3 hop.
  return Math.min(n, 5);
}
