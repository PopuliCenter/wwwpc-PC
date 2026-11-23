/**
 * Samarkan email untuk LOG (T-34): `budi.santoso@example.com` → `b***@example.com`.
 * Domain dipertahankan (berguna untuk diagnosa pengiriman), local-part dibuang.
 * Jangan dipakai untuk apa pun selain log.
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '(tanpa email)';
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';
  return `${email[0]}***${email.slice(at)}`;
}
