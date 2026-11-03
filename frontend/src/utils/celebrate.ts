/**
 * Ledakan konfeti perayaan — dipakai saat momen sukses (survei terkirim, reward
 * berhasil ditukar). Ringan, tanpa dependensi, DOM murni (Web Animations API).
 * Menghormati `prefers-reduced-motion`. Aman dipanggil di web & WebView native.
 *
 * Pemakaian:  celebrate();                      // dari tengah-atas layar
 *             celebrate({ x: cx, y: cy });      // dari titik tertentu (mis. tombol)
 */
const COLORS = ['#F26522', '#234E8C', '#7BA6D8', '#AECAE9', '#DFE2E3'];

export function celebrate(origin?: { x: number; y: number }): void {
  if (typeof document === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  const cx = origin?.x ?? window.innerWidth / 2;
  const cy = origin?.y ?? window.innerHeight / 3;

  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden;';
  document.body.appendChild(layer);

  const count = 50;
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    const size = 6 + Math.random() * 7;
    piece.style.cssText = `position:absolute;left:${cx}px;top:${cy}px;width:${size}px;height:${size}px;background:${
      COLORS[i % COLORS.length]
    };border-radius:2px;`;
    layer.appendChild(piece);

    const angle = Math.random() * Math.PI * 2;
    const velocity = 130 + Math.random() * 240;
    const dx = Math.cos(angle) * velocity;
    const dy = Math.sin(angle) * velocity - 140; // bias ke atas dulu
    const spin = (Math.random() - 0.5) * 900;

    piece.animate(
      [
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        {
          transform: `translate(${dx}px, ${dy + 480}px) rotate(${spin}deg)`,
          opacity: 0,
        },
      ],
      {
        duration: 1100 + Math.random() * 500,
        easing: 'cubic-bezier(.15,.7,.3,1)',
        fill: 'forwards',
      },
    );
  }

  window.setTimeout(() => layer.remove(), 1700);
}
