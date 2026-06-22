import { Capacitor } from '@capacitor/core';

// Client ID WEB (sama dengan yang dipakai login Google web & diverifikasi backend
// di POST /auth/google). Di native dipakai sebagai serverClientId agar idToken
// yang dihasilkan punya audience = client ID ini.
const WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

/**
 * Apakah Google Sign-In NATIVE tersedia: berjalan di shell Capacitor (Android/iOS)
 * DAN client ID sudah diset. Google memblokir OAuth di dalam WebView
 * ("disallowed_useragent"), jadi tombol Google Identity Services (web) tidak bisa
 * dipakai di app — di native kita pakai plugin native sebagai gantinya.
 */
export function isNativeGoogleAvailable(): boolean {
  return Capacitor.isNativePlatform() && !!WEB_CLIENT_ID;
}

let initPromise: Promise<void> | null = null;
async function ensureInitialized(): Promise<void> {
  if (!initPromise) {
    const { SocialLogin } = await import('@capgo/capacitor-social-login');
    initPromise = SocialLogin.initialize({
      google: { webClientId: WEB_CLIENT_ID! },
    });
  }
  await initPromise;
}

/**
 * Login Google NATIVE → mengembalikan idToken untuk dikirim ke backend
 * (POST /auth/google), persis seperti alur web. Melempar error bila gagal /
 * dibatalkan pengguna agar pemanggil bisa menampilkan pesan.
 */
export async function signInWithGoogleNative(): Promise<string> {
  await ensureInitialized();
  const { SocialLogin } = await import('@capgo/capacitor-social-login');
  // CATATAN: JANGAN kirim `scopes` di Android — plugin menolaknya ("You CANNOT
  // use scopes without modifying the main activity"). Login dasar (idToken +
  // email/nama) tidak butuh scopes; scope dasar (openid/email/profile) implisit.
  const res = await SocialLogin.login({
    provider: 'google',
    options: {},
  });
  const result = (res as { result?: { idToken?: string | null } })?.result;
  const idToken = result?.idToken;
  if (!idToken) {
    throw new Error('Google tidak mengembalikan idToken');
  }
  return idToken;
}
