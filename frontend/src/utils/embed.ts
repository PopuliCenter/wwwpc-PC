// Mode embed: aktif saat aplikasi dibuka di dalam iframe (mis. widget HTML Elementor)
// dengan query `?embed=1`. Sekali terdeteksi, disimpan di sessionStorage agar tetap
// aktif setelah navigasi antar-halaman di dalam iframe (login -> /surveys, dst).
const KEY = 'embedMode';

function detect(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const value = new URLSearchParams(window.location.search).get('embed');
    if (value === '1' || value === 'true') {
      window.sessionStorage.setItem(KEY, '1');
      return true;
    }
    return window.sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

// Konstan: mode embed tidak berubah selama satu sesi tab.
export const isEmbedMode = detect();

// Tandai <html> agar bisa dipakai untuk styling tambahan (mis. background transparan).
if (isEmbedMode && typeof document !== 'undefined') {
  document.documentElement.classList.add('embed');
}

// Kirim tinggi konten ke halaman induk (Elementor) agar iframe bisa auto-resize
// tanpa scrollbar ganda. Aman lintas-origin (targetOrigin '*' hanya mengirim tinggi).
export function postEmbedHeight(): void {
  if (!isEmbedMode || typeof window === 'undefined' || window.parent === window) return;
  const height = Math.ceil(document.documentElement.scrollHeight);
  window.parent.postMessage({ type: 'survei-embed:height', height }, '*');
}
