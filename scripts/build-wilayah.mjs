/**
 * Regenerasi data wilayah lokal (frontend/public/wilayah/*.json) dari sumber
 * guzfirdaus/Wilayah-Administrasi-Indonesia (kode Permendagri).
 *
 * Jalankan saat ada pemekaran/perubahan wilayah:
 *   node scripts/build-wilayah.mjs
 *
 * Output: provinces.json, regencies.json, districts.json, villages.json
 * (format {id, [parent_id], name}). CSV sumber memakai pemisah ';'.
 */
import { writeFileSync, mkdirSync } from 'fs';

const BASE =
  'https://raw.githubusercontent.com/guzfirdaus/Wilayah-Administrasi-Indonesia/master/csv';
const OUT = 'frontend/public/wilayah';

function parseCsv(text, cols) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  lines.shift(); // header
  return lines.map((ln) => {
    const parts = [];
    let rest = ln;
    for (let i = 0; i < cols.length - 1; i++) {
      const idx = rest.indexOf(';');
      parts.push(rest.slice(0, idx));
      rest = rest.slice(idx + 1);
    }
    parts.push(rest);
    const obj = {};
    cols.forEach((c, i) => {
      let v = parts[i].trim();
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1).replace(/""/g, '"');
      obj[c] = v;
    });
    return obj;
  });
}

async function build(file, cols) {
  const res = await fetch(`${BASE}/${file}.csv`);
  if (!res.ok) throw new Error(`Gagal unduh ${file}.csv: ${res.status}`);
  const rows = parseCsv(await res.text(), cols);
  writeFileSync(`${OUT}/${file}.json`, JSON.stringify(rows));
  console.log(`${file}.json: ${rows.length} baris`);
}

mkdirSync(OUT, { recursive: true });
await build('provinces', ['id', 'name']);
await build('regencies', ['id', 'province_id', 'name']);
await build('districts', ['id', 'regency_id', 'name']);
await build('villages', ['id', 'district_id', 'name']);
console.log('Selesai. Commit perubahan di frontend/public/wilayah/.');
