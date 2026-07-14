/* Generator aset Play Store: ikon 512x512 + feature graphic 1024x500.
   Keduanya TANPA transparansi (syarat Play). */
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/Survei Apps/aplikasi-survei-web-online';
const sharp = require(path.join(ROOT, 'node_modules/sharp'));
const LOGO = path.join(ROOT, 'frontend/public/logo-populi-center.png');
const OUT = path.join(ROOT, 'docs/play-store/assets');
fs.mkdirSync(OUT, { recursive: true });

const FONT = 'Segoe UI, Arial, Helvetica, sans-serif';

async function icon() {
  // Logo dengan padding ~14% di dalam kanvas 512 putih.
  const logo = await sharp(LOGO).resize(368, 368, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } }).toBuffer();
  await sharp({ create: { width: 512, height: 512, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite([{ input: logo, gravity: 'centre' }])
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, 'icon-512.png'));
}

async function feature() {
  const svg = Buffer.from(`
<svg width="1024" height="500" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#6366f1"/>
      <stop offset="55%" stop-color="#4338ca"/>
      <stop offset="100%" stop-color="#312e81"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="500" fill="url(#bg)"/>
  <circle cx="905" cy="70" r="190" fill="#ffffff" opacity="0.05"/>
  <circle cx="60" cy="450" r="140" fill="#ffffff" opacity="0.04"/>
  <text x="392" y="205" font-family="${FONT}" font-size="60" font-weight="700" fill="#ffffff">Riset Populi Center</text>
  <text x="392" y="268" font-family="${FONT}" font-size="31" fill="#c7d2fe">Isi survei, kumpulkan poin,</text>
  <text x="392" y="311" font-family="${FONT}" font-size="31" fill="#c7d2fe">tukar jadi pulsa atau saldo e-wallet.</text>
  <rect x="392" y="352" width="250" height="46" rx="23" fill="#F86828"/>
  <text x="517" y="383" font-family="${FONT}" font-size="22" font-weight="600" fill="#ffffff" text-anchor="middle">Survei Opini Publik</text>
</svg>`);

  const logo = await sharp(LOGO).resize(232, 232, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();

  await sharp(svg)
    .composite([{ input: logo, left: 108, top: 134 }])
    .flatten({ background: { r: 67, g: 56, b: 202 } })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, 'feature-graphic-1024x500.png'));
}

(async () => {
  await icon();
  await feature();
  for (const f of ['icon-512.png', 'feature-graphic-1024x500.png']) {
    const p = path.join(OUT, f);
    const m = await sharp(p).metadata();
    const kb = (fs.statSync(p).size / 1024).toFixed(0);
    console.log(`${f.padEnd(30)} ${m.width}x${m.height}  alpha=${m.hasAlpha}  ${kb} KB`);
  }
})();
