import { useEffect } from 'react';
import { isEmbedMode, postEmbedHeight } from '@/utils/embed';

// Saat mode embed, laporkan tinggi konten ke halaman induk (Elementor) tiap kali
// konten berubah — termasuk navigasi antar-halaman (SPA) yang kadang lolos dari
// ResizeObserver dan membuat iframe "overshoot" (tetap tinggi di halaman pendek).
export function EmbedHeightReporter() {
  useEffect(() => {
    if (!isEmbedMode) return;

    postEmbedHeight();

    // ResizeObserver: perubahan ukuran elemen. MutationObserver: konten diganti
    // saat pindah halaman. Interval: jaring pengaman terakhir.
    const ro = new ResizeObserver(() => postEmbedHeight());
    ro.observe(document.documentElement);
    if (document.body) ro.observe(document.body);

    const mo = new MutationObserver(() => postEmbedHeight());
    if (document.body) {
      mo.observe(document.body, { childList: true, subtree: true });
    }

    window.addEventListener('load', postEmbedHeight);
    const intervalId = window.setInterval(postEmbedHeight, 500);

    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener('load', postEmbedHeight);
      window.clearInterval(intervalId);
    };
  }, []);

  return null;
}
