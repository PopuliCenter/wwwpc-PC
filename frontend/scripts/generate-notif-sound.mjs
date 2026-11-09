#!/usr/bin/env node
/**
 * Generator nada notifikasi aplikasi Android "Riset Populi Center".
 *
 * Nada ORISINAL hasil sintesis murni (tanpa sampel/audio dari luar): tiga
 * ketukan naik ala "so–do–mi" pada akord A mayor (E5 → A5 → C#6). Tiap ketukan
 * adalah sinus dengan sedikit harmonik (warna hangat seperti mallet lembut),
 * attack halus 6 ms, lalu decay eksponensial alami. Harmonik atas meluruh lebih
 * cepat daripada nada dasarnya, jadi ekornya makin bulat. Ujung berkas diberi
 * fade-out kosinus sehingga sampel pertama dan terakhir tepat 0 (tanpa klik).
 *
 * Keluaran: android/app/src/main/res/raw/populi_notif.wav
 *   WAV RIFF, mono, PCM 16-bit, 44.1 kHz, puncak -3 dBFS (tanpa clipping).
 * Dipakai oleh channel Android 'populi_pemberitahuan' (src/services/notifications.ts)
 * dan payload FCM backend (push.service.ts, sound 'populi_notif').
 *
 * Deterministik: dijalankan ulang menghasilkan berkas yang sama persis byte demi byte.
 *
 * Jalankan dari folder frontend:  node scripts/generate-notif-sound.mjs [path-keluaran]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 44100;
const DURATION_S = 0.8;
const PEAK_DBFS = -3;
const ATTACK_S = 0.006;
const FADE_OUT_S = 0.12;

/** Partial tiap ketukan: kelipatan frekuensi dasar + amplitudo relatif. */
const PARTIALS = [
  { mult: 1, amp: 1 },
  { mult: 2, amp: 0.22 },
  { mult: 3, amp: 0.06 },
];

/** Tiga ketukan naik. decay = konstanta waktu (detik) peluruhan nada dasar. */
const NOTES = [
  { name: 'E5', freq: 659.26, start: 0.0, gain: 0.72, decay: 0.15 },
  { name: 'A5', freq: 880.0, start: 0.12, gain: 0.82, decay: 0.15 },
  { name: 'C#6', freq: 1108.73, start: 0.24, gain: 1.0, decay: 0.24 },
];

const totalSamples = Math.round(SAMPLE_RATE * DURATION_S);
const signal = new Float64Array(totalSamples);

for (const note of NOTES) {
  const first = Math.round(note.start * SAMPLE_RATE);
  for (let i = first; i < totalSamples; i++) {
    const t = (i - first) / SAMPLE_RATE;
    // Attack setengah-Hann: naik halus dari 0 agar tidak ada transien tajam.
    const attack = t < ATTACK_S ? 0.5 - 0.5 * Math.cos((Math.PI * t) / ATTACK_S) : 1;
    let sample = 0;
    for (const p of PARTIALS) {
      // Harmonik ke-k meluruh k kali lebih cepat → ekor nada makin bulat.
      const env = Math.exp((-t * p.mult) / note.decay);
      sample += p.amp * env * Math.sin(2 * Math.PI * note.freq * p.mult * t);
    }
    signal[i] += note.gain * attack * sample;
  }
}

// Fade-out kosinus di ujung → sampel terakhir tepat 0.
const fadeSamples = Math.round(FADE_OUT_S * SAMPLE_RATE);
for (let k = 0; k < fadeSamples; k++) {
  const i = totalSamples - fadeSamples + k;
  const progress = k / (fadeSamples - 1);
  signal[i] *= 0.5 + 0.5 * Math.cos(Math.PI * progress);
}

// Normalisasi puncak ke -3 dBFS.
let rawPeak = 0;
for (const s of signal) rawPeak = Math.max(rawPeak, Math.abs(s));
const targetPeak = 10 ** (PEAK_DBFS / 20);
const scale = targetPeak / rawPeak;

const pcm = new Int16Array(totalSamples);
let peakInt = 0;
let sumSquares = 0;
for (let i = 0; i < totalSamples; i++) {
  const v = Math.round(signal[i] * scale * 32767);
  if (v > 32767 || v < -32768) throw new Error(`Clipping pada sampel ${i}`);
  pcm[i] = v;
  peakInt = Math.max(peakInt, Math.abs(v));
  sumSquares += (v / 32768) ** 2;
}

// Header WAV RIFF standar 44 byte (PCM, little-endian).
const dataBytes = totalSamples * 2;
const buffer = Buffer.alloc(44 + dataBytes);
buffer.write('RIFF', 0, 'ascii');
buffer.writeUInt32LE(36 + dataBytes, 4);
buffer.write('WAVE', 8, 'ascii');
buffer.write('fmt ', 12, 'ascii');
buffer.writeUInt32LE(16, 16); // ukuran chunk fmt
buffer.writeUInt16LE(1, 20); // format PCM
buffer.writeUInt16LE(1, 22); // mono
buffer.writeUInt32LE(SAMPLE_RATE, 24);
buffer.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
buffer.writeUInt16LE(2, 32); // block align
buffer.writeUInt16LE(16, 34); // bit per sampel
buffer.write('data', 36, 'ascii');
buffer.writeUInt32LE(dataBytes, 40);
for (let i = 0; i < totalSamples; i++) buffer.writeInt16LE(pcm[i], 44 + i * 2);

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(
  process.argv[2] ?? resolve(here, '../android/app/src/main/res/raw/populi_notif.wav'),
);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, buffer);

const toDb = (x) => (20 * Math.log10(x)).toFixed(2);
console.log(`Ditulis: ${outPath}`);
console.log(
  `  ${SAMPLE_RATE} Hz, mono, 16-bit, ${DURATION_S} dtk, ${totalSamples} sampel, ${buffer.length} byte`,
);
console.log(
  `  Nada: ${NOTES.map((n) => `${n.name} ${n.freq} Hz @${n.start * 1000} ms`).join(', ')}`,
);
console.log(
  `  Puncak ${toDb(peakInt / 32768)} dBFS, RMS ${toDb(Math.sqrt(sumSquares / totalSamples))} dBFS`,
);
console.log(`  Sampel pertama ${pcm[0]}, terakhir ${pcm[totalSamples - 1]}`);
