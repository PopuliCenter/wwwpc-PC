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

// Tinggi terakhir yang dilaporkan — hanya kirim saat berubah, agar iframe tidak
// "overshoot" (tetap tinggi setelah pindah ke halaman yang lebih pendek) dan
// induk tidak di-spam pesan.
let lastReportedHeight = 0;

// Kirim tinggi konten ke halaman induk (Elementor) agar iframe bisa auto-resize
// tanpa scrollbar ganda. Aman lintas-origin (targetOrigin '*' hanya mengirim tinggi).
// Mengukur tinggi KONTEN sebenarnya (bukan minimal viewport) supaya tidak kelebihan.
export function postEmbedHeight(): void {
  if (!isEmbedMode || typeof window === 'undefined' || window.parent === window) return;
  const body = document.body;
  const html = document.documentElement;
  // scrollHeight body = tinggi konten nyata; pakai yang terbesar yang masuk akal,
  // tetapi hindari html.scrollHeight yang bisa ikut membesar oleh min-h-screen.
  const height = Math.ceil(
    Math.max(body?.scrollHeight ?? 0, body?.offsetHeight ?? 0, html.scrollHeight),
  );
  if (height <= 0 || height === lastReportedHeight) return;
  lastReportedHeight = height;
  window.parent.postMessage({ type: 'survei-embed:height', height }, '*');
}
