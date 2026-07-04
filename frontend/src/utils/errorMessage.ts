/**
 * Ekstrak pesan error yang bisa ditampilkan ke pengguna dari nilai `unknown`
 * (respons error API `{ message }`, array pesan validasi, atau Error biasa).
 * Dipakai lintas halaman agar penanganan error konsisten (tak perlu cast inline
 * `(e as { message?: string }).message` di tiap blok catch).
 */
export function errorMessage(e: unknown, fallback = 'Terjadi kesalahan. Coba lagi.'): string {
  const m = (e as { message?: unknown })?.message;
  if (Array.isArray(m)) return m.filter(Boolean).join(', ');
  if (typeof m === 'string' && m.trim()) return m;
  return fallback;
}
