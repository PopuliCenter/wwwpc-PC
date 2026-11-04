import { useEffect, useRef, useState } from 'react';
import { isNativeGoogleAvailable, signInWithGoogleNative } from '@/services/google-auth';
import { useTheme } from '@/utils/theme';
import { useTapFeedback } from './Button';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const GSI_SRC = 'https://accounts.google.com/gsi/client';

let gsiPromise: Promise<void> | null = null;

/** Muat skrip Google Identity Services sekali (hanya untuk web). */
function loadGsi(): Promise<void> {
  if (gsiPromise) return gsiPromise;
  gsiPromise = new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${GSI_SRC}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = GSI_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Gagal memuat Google Sign-In'));
    document.head.appendChild(s);
  });
  return gsiPromise;
}

/**
 * Tombol "Masuk dengan Google". Mengembalikan ID token lewat `onCredential`.
 * - Di NATIVE (Capacitor): pakai plugin Google Sign-In native (Google memblokir
 *   OAuth di WebView, jadi GIS web tidak bisa dipakai di app).
 * - Di WEB: pakai Google Identity Services (GIS).
 * Tidak ditampilkan bila VITE_GOOGLE_CLIENT_ID belum diset.
 */
export function GoogleSignInButton({
  onCredential,
  label,
}: {
  onCredential: (idToken: string) => void;
  /** Teks tombol native (bawaan: "Masuk dengan Google"). Tombol web mengikuti teks Google. */
  label?: string;
}) {
  if (isNativeGoogleAvailable()) {
    return <NativeGoogleButton onCredential={onCredential} label={label} />;
  }
  return <WebGoogleButton onCredential={onCredential} />;
}

/** Tombol native — memicu plugin Google Sign-In lalu mengirim idToken. */
function NativeGoogleButton({
  onCredential,
  label = 'Masuk dengan Google',
}: {
  onCredential: (idToken: string) => void;
  label?: string;
}) {
  const tap = useTapFeedback();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleClick = async () => {
    setError('');
    setLoading(true);
    try {
      const idToken = await signInWithGoogleNative();
      onCredential(idToken);
    } catch {
      // Termasuk saat pengguna membatalkan dialog.
      setError('Gagal masuk dengan Google. Coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={(e) => {
          tap(e);
          void handleClick();
        }}
        disabled={loading}
        className="relative flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-panel px-4 text-base font-medium text-gray-800 transition-colors hover:bg-gray-50 active:bg-gray-100 disabled:opacity-60 lg:h-11"
      >
        <GoogleGlyph />
        {loading ? 'Memproses…' : label}
      </button>
      {error && <p className="text-xs text-danger-fg">{error}</p>}
    </div>
  );
}

/** Tombol web (Google Identity Services). */
function WebGoogleButton({ onCredential }: { onCredential: (idToken: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const initializedFor = useRef<((idToken: string) => void) | null>(null);
  const { resolved } = useTheme();

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let cancelled = false;
    loadGsi()
      .then(() => {
        if (cancelled || !ref.current) return;
        const g = (window as unknown as { google?: any }).google;
        if (!g?.accounts?.id) return;
        // Ganti tema hanya menggambar ulang tombol; initialize cukup per callback.
        if (initializedFor.current !== onCredential) {
          initializedFor.current = onCredential;
          g.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: (resp: { credential?: string }) => {
              if (resp?.credential) onCredential(resp.credential);
            },
          });
        }
        ref.current.replaceChildren();
        g.accounts.id.renderButton(ref.current, {
          theme: resolved === 'dark' ? 'filled_black' : 'outline',
          size: 'large',
          width: 320,
          text: 'signin_with',
          shape: 'rectangular',
          logo_alignment: 'center',
        });
      })
      .catch(() => {
        /* gagal memuat → tombol tidak muncul, login lain tetap bisa */
      });
    return () => {
      cancelled = true;
    };
  }, [onCredential, resolved]);

  if (!GOOGLE_CLIENT_ID) return null;
  // color-scheme terang: iframe Google yang beda skema dengan induknya digambar berlatar putih.
  return <div ref={ref} className="flex justify-center" style={{ colorScheme: 'light' }} />;
}

/** Logo "G" Google (inline SVG) untuk tombol native. */
function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}
