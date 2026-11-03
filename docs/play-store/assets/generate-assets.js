/* Generator aset merek: ikon Play Store 512x512, feature graphic 1024x500, dan ikon PWA
   di frontend/public/icons. Aset Play TANPA transparansi (syarat Play). Logo diwarnai
   ulang dari kanal alpha berkas sumber, jadi warnanya selalu tepat nilai di bawah. */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const sharp = require(path.join(ROOT, 'node_modules/sharp'));
const LOGO = path.join(ROOT, 'frontend/public/logo-populi-center.png');
const OUT = path.join(ROOT, 'docs/play-store/assets');
const OUT_PWA = path.join(ROOT, 'frontend/public/icons');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(OUT_PWA, { recursive: true });

const BRAND = { r: 0xf2, g: 0x65, b: 0x22 }; // #F26522, sama dengan ikon HP dan splash
const WHITE = { r: 255, g: 255, b: 255 };
const NAVY = '#0F2342'; // primary-900

// Tumpukan yang sama dengan --font-serif dan --font-sans; hasilnya bergantung font terpasang.
const FONT_SERIF = "'Source Serif 4', 'Noto Serif', Georgia, serif";
const FONT_SANS = "'IBM Plex Sans', Roboto, 'Segoe UI', Arial, sans-serif";

/** Logo berwarna rata seukuran size x size, dengan transparansi dari berkas sumber. */
async function tintedLogo(size, color) {
  const alpha = await sharp(LOGO)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .extractChannel(3)
    .png()
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 3, background: color } })
    .joinChannel(alpha)
    .png()
    .toBuffer();
}

/** Logo putih di atas #F26522 (perlakuan yang sama dengan ikon HP), tanpa alpha. */
async function brandIcon(canvas, logoRatio, file) {
  const logo = await tintedLogo(Math.round(canvas * logoRatio), WHITE);
  await sharp({ create: { width: canvas, height: canvas, channels: 3, background: BRAND } })
    .composite([{ input: logo, gravity: 'centre' }])
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(file);
}

async function feature() {
  const svg = Buffer.from(`
<svg width="1024" height="500" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="500" fill="${NAVY}"/>
  <text x="392" y="238" font-family="${FONT_SERIF}" font-size="54" font-weight="600" fill="#FFFFFF">Riset Populi Center</text>
  <text x="392" y="292" font-family="${FONT_SANS}" font-size="28" fill="#AECAE9">Survei opini publik dari Populi Center</text>
</svg>`);

  const logo = await tintedLogo(232, BRAND);

  await sharp(svg)
    .composite([{ input: logo, left: 108, top: 134 }])
    .flatten({ background: NAVY })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, 'feature-graphic-1024x500.png'));
}

(async () => {
  await brandIcon(512, 0.72, path.join(OUT, 'icon-512.png'));
  await feature();
  // Ikon PWA biasa tampil utuh sebagai persegi, jadi logonya boleh lebih besar.
  await brandIcon(192, 0.76, path.join(OUT_PWA, 'icon-192.png'));
  await brandIcon(512, 0.76, path.join(OUT_PWA, 'icon-512.png'));
  // Maskable: logo bundar 70% kanvas, di dalam area aman lingkaran 80%.
  await brandIcon(512, 0.7, path.join(OUT_PWA, 'icon-maskable-512.png'));

  for (const p of [
    path.join(OUT, 'icon-512.png'),
    path.join(OUT, 'feature-graphic-1024x500.png'),
    path.join(OUT_PWA, 'icon-192.png'),
    path.join(OUT_PWA, 'icon-512.png'),
    path.join(OUT_PWA, 'icon-maskable-512.png'),
  ]) {
    const m = await sharp(p).metadata();
    const kb = (fs.statSync(p).size / 1024).toFixed(0);
    console.log(`${path.relative(ROOT, p).padEnd(50)} ${m.width}x${m.height}  alpha=${m.hasAlpha}  ${kb} KB`);
  }
})();
