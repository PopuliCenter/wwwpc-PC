import { useEffect, useRef, useState } from 'react';

/**
 * Angka yang MENGHITUNG NAIK/TURUN secara mulus saat nilainya berubah (mis.
 * saldo poin bertambah setelah selesai survei). Easing ease-out; menghormati
 * `prefers-reduced-motion` (langsung lompat ke nilai akhir).
 *
 * Tanpa `from`, angka tidak beranimasi saat pertama tampil. Isi `from` agar langsung
 * menghitung dari nilai itu saat mount: `from={0}` di layar selesai, atau nilai
 * terakhir di kartu saldo. `from` hanya dibaca sekali saat mount.
 */
export function CountUp({
  value,
  from,
  durationMs = 600,
  className = '',
  format = (n: number) => n.toLocaleString('id-ID'),
}: {
  value: number;
  from?: number;
  durationMs?: number;
  className?: string;
  format?: (n: number) => string;
}) {
  const [display, setDisplay] = useState(from ?? value);
  // Nilai yang sedang tampil: animasi berikutnya (atau yang terputus) lanjut dari sini.
  const currentRef = useRef(from ?? value);

  useEffect(() => {
    const start = currentRef.current;
    const to = value;
    if (start === to) return;

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      currentRef.current = to;
      setDisplay(to);
      return;
    }

    let startTs: number | null = null;
    let raf = 0;
    const tick = (ts: number) => {
      if (startTs === null) startTs = ts;
      const k = Math.min((ts - startTs) / durationMs, 1);
      const eased = 1 - Math.pow(1 - k, 3);
      const next = Math.round(start + (to - start) * eased);
      currentRef.current = next;
      setDisplay(next);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return <span className={`tabular-nums ${className}`}>{format(display)}</span>;
}
