# Load Test — Survei Populi

Menguji kesiapan beban server sebelum go-live. Alur uji meniru responden nyata:
**login → daftar survei → buka /fill → (kirim jawaban)**.

Target referensi: VPS Hostinger **KVM2 (2 core / 2 GB RAM)**, ~**500 pengguna serentak**.

> ⚠️ **Jangan** menembak produksi live tanpa perhitungan: ada rate-limit + lockout,
> dan submit nyata memicu poin/email. Gunakan stack lokal (panduan ini) atau
> salinan/staging. Reward provider dipaksa `manual` agar tak memicu top-up IAK.

---

## 0. Prasyarat
- **k6** terpasang di host (`winget install k6` / `choco install k6` / [k6.io](https://k6.io/docs/get-started/installation/)).
- Docker Desktop menyala.

## 1. Nyalakan stack lokal (mode load-test, resource ~2c/2g)
```bash
docker compose -f docker-compose.yml -f docker-compose.loadtest.yml up -d --build
```
Ini mempublikasi `backend:3000` ke host, mematikan anti-bot min-time, melonggarkan
throttle, dan membatasi CPU/RAM tiap service agar total ≈ VPS.

## 2. Seed akun uji (tanpa OTP) + buat survei uji
```bash
# 2000 akun responden aktif (email loadtest+000001@loadtest.local .. dst, password LoadTest12345)
docker compose exec -e LOADTEST_USERS=2000 backend node dist/seed-loadtest.js
```
> Untuk uji **tukar reward**, tambах `-e LOADTEST_POINTS=100000`.

**Buat 1 survei uji** lewat panel admin (login admin → Manajemen Survei):
- Beberapa pertanyaan **sederhana** (short_text / single_choice / numeric_scale).
- **Tanpa targeting** (gender/wilayah kosong), **tanpa batas waktu**, status **Aktif**.
- Salin **ID survei** dari URL (`/surveys/<ID>/...`). Ini jadi `SURVEY_ID`.

## 3. Jalankan k6
```bash
# Smoke dulu (sanity, 3 VU / 30s)
k6 run -e BASE_URL=http://localhost:3000 -e SURVEY_ID=<ID> -e SCENARIO=smoke loadtest/k6/script.js

# Load ~500 serentak, mode baca-berat (repeatable)
k6 run -e BASE_URL=http://localhost:3000 -e SURVEY_ID=<ID> -e SCENARIO=load -e VUS=500 loadtest/k6/script.js

# Uji jalur TULIS (submit). Tiap iterasi pakai 1 akun → iterasi total ≤ LOADTEST_USERS.
k6 run -e BASE_URL=http://localhost:3000 -e SURVEY_ID=<ID> -e SCENARIO=load -e MODE=submit -e VUS=300 -e LOADTEST_USERS=2000 loadtest/k6/script.js

# Cari titik patah
k6 run -e BASE_URL=http://localhost:3000 -e SURVEY_ID=<ID> -e SCENARIO=stress -e VUS=250 loadtest/k6/script.js
```
Skenario: `smoke | load | stress | spike | soak`. Knob: `VUS`, `DURATION`, `MODE`,
`P95_MS` (ambang p95, default 800), `ERR_RATE` (default 0.01).

## 4. Pantau server saat tes jalan (terminal lain)
```bash
docker stats                         # CPU/RAM tiap container real-time
docker compose logs -f backend       # error / "too many connections" / OOM
```
Yang dicari: CPU backend/postgres mentok 100%, RAM naik terus (leak), error pool
DB (`remaining connection slots`), latensi p95 meledak.

## 5. Baca hasil k6
- `http_req_duration p(95)` — target < 800ms (setel `P95_MS`).
- `http_req_failed` & `business_errors` — target < 1%.
- Bila **threshold merah** → server belum sanggup di beban itu; lihat Tuning.

## 6. Reset antar-run (agar akun bisa submit lagi)
```bash
docker compose exec -e LOADTEST_CLEANUP=responses backend node dist/cleanup-loadtest.js
# Hapus total akun+poin+respons:
docker compose exec -e LOADTEST_CLEANUP=all backend node dist/cleanup-loadtest.js
```

## 7. Setelah selesai
```bash
docker compose -f docker-compose.yml -f docker-compose.loadtest.yml down
```

---

## Tuning bila mentok (2c/2g itu kecil untuk 500 penulis serentak)
- **Pool koneksi DB**: pastikan `max` pool backend ≤ Postgres `max_connections` (default 100). Terlalu besar → Postgres tolak; terlalu kecil → antre. Sesuaikan di config DB.
- **Postgres**: `shared_buffers`, `work_mem` kecil di 2GB → tuning `postgresql.conf` atau naikkan RAM VPS.
- **Node**: satu proses = 1 core efektif; 2 core → jalankan **2 instance backend** di belakang nginx (PM2/replika compose) untuk memakai kedua core.
- **Redis/MinIO** ikut memakan RAM 2GB — pertimbangkan MinIO/Redis di host terpisah bila padat.
- **Realistis**: 500 penulis serentak menyimpan ke DB di 2c/2g kemungkinan berat. Uji ini akan menunjukkan angka konkret; bila perlu, naikkan VPS (KVM4) atau pisah DB.

## Catatan akurasi
Batas resource lokal adalah aproksimasi kontensi VPS. Untuk angka final, ulangi
tes terhadap **salinan di VPS** pada jendela maintenance (throttle dilonggarkan,
reward manual). Perangkat & skrip yang sama bisa dipakai — cukup ganti `BASE_URL`.
