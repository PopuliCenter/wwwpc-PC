import { useEffect } from 'react';
import { isEmbedMode, postEmbedHeight } from '@/utils/embed';

// Saat mode embed, laporkan tinggi konten ke halaman induk (Elementor) tiap kali
// konten berubah ukuran (termasuk saat pindah halaman), supaya iframe auto-resize.
export function EmbedHeightReporter() {
  useEffect(() => {
    if (!isEmbedMode) return;

    postEmbedHeight();

    const observer = new ResizeObserver(() => postEmbedHeight());
    observer.observe(document.documentElement);
    window.addEventListener('load', postEmbedHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener('load', postEmbedHeight);
    };
  }, []);

  return null;
}
