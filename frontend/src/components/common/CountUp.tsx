import { useEffect, useRef, useState } from 'react';

/**
 * Angka yang MENGHITUNG NAIK/TURUN secara mulus saat nilainya berubah (mis.
 * saldo poin bertambah setelah selesai survei). Easing ease-out; menghormati
 * `prefers-reduced-motion` (langsung lompat ke nilai akhir).
 */
export function CountUp({
  value,
  durationMs = 700,
  className,
  format = (n: number) => n.toLocaleString('id-ID'),
}: {
  value: number;
  durationMs?: number;
  className?: string;
  format?: (n: number) => string;
}) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setDisplay(to);
      fromRef.current = to;
      return;
    }

    let start: number | null = null;
    const tick = (ts: number) => {
      if (start === null) start = ts;
      const k = Math.min((ts - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - k, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (k < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      fromRef.current = to; // pastikan animasi berikutnya mulai dari nilai terkini
    };
  }, [value, durationMs]);

  return <span className={className}>{format(display)}</span>;
}
