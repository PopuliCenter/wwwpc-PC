import { useEffect, useRef } from 'react';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const GSI_SRC = 'https://accounts.google.com/gsi/client';

let gsiPromise: Promise<void> | null = null;

/** Muat skrip Google Identity Services sekali. */
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
 * Tombol "Masuk dengan Google" (Google Identity Services). Mengembalikan ID token
 * lewat `onCredential`. Otomatis tidak ditampilkan bila VITE_GOOGLE_CLIENT_ID
 * belum diset (fitur belum dikonfigurasi).
 */
export function GoogleSignInButton({
  onCredential,
}: {
  onCredential: (idToken: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let cancelled = false;
    loadGsi()
      .then(() => {
        if (cancelled || !ref.current) return;
        const g = (window as unknown as { google?: any }).google;
        if (!g?.accounts?.id) return;
        g.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (resp: { credential?: string }) => {
            if (resp?.credential) onCredential(resp.credential);
          },
        });
        g.accounts.id.renderButton(ref.current, {
          theme: 'outline',
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
  }, [onCredential]);

  if (!GOOGLE_CLIENT_ID) return null;
  return <div ref={ref} className="flex justify-center" />;
}
