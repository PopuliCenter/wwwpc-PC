#!/usr/bin/env node
/**
 * Gerbang audit dependensi PRODUKSI untuk CI.
 *
 * Menggantikan `npm audit --omit=dev --audit-level=high` polos. Alasannya:
 * sebagian advisory `high` hanya bisa ditutup lewat upgrade major yang berisiko
 * (mis. @nestjs v10 → v12) dan TIDAK boleh diburu saat rilis. Menurunkan
 * `--audit-level` akan membutakan gerbang terhadap SEMUA high — berbahaya.
 *
 * Sebagai gantinya: gerbang GAGAL bila ada high/critical DI LUAR allowlist di
 * bawah. Tiap entri allowlist WAJIB punya alasan + tanggal kedaluwarsa. Setelah
 * lewat tanggalnya, gerbang GAGAL lagi — memaksa advisory ditinjau ulang, bukan
 * dilupakan.
 *
 * Jalankan: node scripts/audit-gate.mjs
 */
import { execSync } from 'node:child_process';

/**
 * Advisory yang di-terima-risiko SEMENTARA. Semua berakar pada stack @nestjs v10
 * yang penutupannya butuh upgrade ke v12 (proyek terpisah, bukan go-live).
 *
 * expires: setelah tanggal ini gerbang gagal lagi (paksa tinjau ulang).
 */
const ALLOWLIST = [
  // @nestjs/core injection — hanya tertutup di v12 (breaking). Dinilai risiko
  // rendah pada pemakaian app ini; dijadwalkan upgrade v10→v12.
  { id: 'GHSA-36xv-jgw5-4q75', reason: '@nestjs/core; perlu upgrade v12', expires: '2026-12-31' },
  // multer DoS/bypass — multer di-pin 2.0.2 oleh @nestjs/platform-express@10;
  // naik bersih baru mungkin setelah platform-express v11/v12. Dampak dibatasi:
  // endpoint upload wajib auth+profil lengkap, di belakang Cloudflare, dan cek
  // ukuran berkas milik app sendiri (file-validation.service) menahan bypass.
  { id: 'GHSA-wc9g-mqfw-jrwm', reason: 'multer DoS; ikut upgrade @nestjs', expires: '2026-12-31' },
  { id: 'GHSA-qfvm-cv95-jqjf', reason: 'multer DoS; ikut upgrade @nestjs', expires: '2026-12-31' },
  { id: 'GHSA-qvfw-j98x-7q72', reason: 'multer size-bypass; ditahan cek ukuran app', expires: '2026-12-31' },
  { id: 'GHSA-535w-7cp7-47q4', reason: 'multer DoS; ikut upgrade @nestjs', expires: '2026-12-31' },
  // body-parser DoS (limit tak berlaku) via express bundled di platform-express@10;
  // akar sama, tertutup oleh upgrade @nestjs/express. App set batas body sendiri.
  { id: 'GHSA-v422-hmwv-36x6', reason: 'body-parser DoS; ikut upgrade @nestjs', expires: '2026-12-31' },
];

const today = new Date().toISOString().slice(0, 10);
const allowById = new Map(ALLOWLIST.map((a) => [a.id, a]));

let raw;
try {
  raw = execSync('npm audit --omit=dev --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
} catch (e) {
  // npm audit keluar non-nol saat ada temuan — outputnya tetap di stdout.
  raw = e.stdout?.toString() || '';
}
if (!raw) {
  console.error('audit-gate: tidak ada output dari npm audit');
  process.exit(2);
}

const report = JSON.parse(raw);
const vulns = report.vulnerabilities || {};

// Kumpulkan GHSA sebuah paket, menelusuri rujukan transitif: `via` bisa berupa
// objek advisory (punya url GHSA) ATAU string nama paket lain yang rentan
// (mis. platform-express rentan KARENA @nestjs/core). Telusuri sampua ke akar.
const ghsaOf = (name, seen = new Set()) => {
  const out = new Set();
  const v = vulns[name];
  if (!v || seen.has(name)) return out;
  seen.add(name);
  for (const via of v.via || []) {
    if (typeof via === 'object' && via.url) {
      const m = via.url.match(/GHSA-[a-z0-9-]+/i);
      if (m) out.add(m[0]);
    } else if (typeof via === 'string') {
      for (const id of ghsaOf(via, seen)) out.add(id);
    }
  }
  return [...out];
};

const blocking = [];
const allowed = [];
const expired = [];

for (const [name, v] of Object.entries(vulns)) {
  if (v.severity !== 'high' && v.severity !== 'critical') continue;
  const ids = ghsaOf(name);
  // Sebuah paket lolos hanya bila SETIAP advisory-nya ada di allowlist & belum kedaluwarsa.
  const unlisted = ids.filter((id) => !allowById.has(id));
  const past = ids.filter((id) => allowById.has(id) && allowById.get(id).expires < today);
  if (ids.length === 0 || unlisted.length > 0) {
    blocking.push({ name, severity: v.severity, ids: ids.length ? ids : ['(tanpa GHSA)'] });
  } else if (past.length > 0) {
    expired.push({ name, ids: past });
  } else {
    allowed.push({ name, ids });
  }
}

if (allowed.length) {
  console.log('Diterima-risiko sementara (allowlist):');
  for (const a of allowed) {
    for (const id of a.ids) {
      const e = allowById.get(id);
      console.log(`  - ${a.name} ${id} — ${e.reason} (s/d ${e.expires})`);
    }
  }
}

if (expired.length) {
  console.error('\nGAGAL: allowlist KEDALUWARSA — tinjau ulang & upgrade:');
  for (const a of expired) console.error(`  - ${a.name}: ${a.ids.join(', ')}`);
}

if (blocking.length) {
  console.error('\nGAGAL: high/critical DI LUAR allowlist:');
  for (const b of blocking) console.error(`  - [${b.severity}] ${b.name}: ${b.ids.join(', ')}`);
  console.error('\nPerbaiki dependensinya, atau (bila memang harus ditunda) tambah ke ALLOWLIST');
  console.error('di scripts/audit-gate.mjs dengan alasan + tanggal kedaluwarsa.');
}

if (blocking.length || expired.length) process.exit(1);
console.log(`\nOK: nol high/critical di luar allowlist. (moderate/low tidak memblokir)`);
process.exit(0);
