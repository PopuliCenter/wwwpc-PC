# Migrasi Domain: survei.risetcenter.com → survei.populicenter.com

Panduan langkah-demi-langkah memindahkan aplikasi survei ke domain baru
`survei.populicenter.com`, dengan `survei.risetcenter.com` di-**301 redirect** ke
domain baru (link/QR/email lama tetap jalan).

Prasyarat yang sudah dikerjakan user: record DNS di Cloudflare zona
`populicenter.com` (`populicenter.com`, `survei.populicenter.com`,
`wa.populicenter.com` → A `187.127.114.159`, Proxied/awan oranye).

Ganti kode/env di repo sudah dilakukan (commit migrasi). Sisanya di bawah adalah
tindakan di Cloudflare + VPS + Google + rebuild AAB.

---

## 1. Cloudflare — sertifikat Origin

Karena SELURUH VPS dipindah ke populicenter.com, file cert bersama
`/etc/nginx/certs/origin.pem` (+ `origin.key`) kini berisi **Cloudflare Origin
Certificate zona populicenter.com** (SAN `*.populicenter.com` + `populicenter.com`).
SAN `*.populicenter.com` sudah mencakup `survei.populicenter.com`, jadi vhost
survei memakai `origin.pem` yang sama — **tidak perlu file cert terpisah**.

- Cert risetcenter lama di-backup sebagai `origin.pem.bak` / `origin.key.bak`.
- **SSL/TLS → Overview** zona populicenter.com: mode **Full** (disarankan). Bila
  **Flexible**, vhost sudah menyertakan `listen 80;` sebagai jaring pengaman.
- Catatan: vhost redirect `survei.risetcenter.com.conf` juga menunjuk `origin.pem`.
  Karena zona risetcenter.com pakai Flexible (CF↔origin via port 80) dan block ini
  hanya `return 301`, mismatch cert di listener 443 tidak dipakai CF — redirect
  tetap jalan.

## 2. VPS — pasang vhost

> ⚠️ **Catatan historis migrasi (Juli 2026) — JANGAN diulang apa adanya.**
> Versi asli bagian ini menyuruh (a) menyalin `docker-compose.override.yml` dari
> repo ke app lama "bila belum ada", lalu (b) `docker compose up -d` **tanpa
> target**. Keduanya TIDAK AMAN sekarang:
>
> - salinan di repo (`deploy/opsi-b-persistent/`) hanya memuat mount vhost
>   survei — **mount vhost WA (dan vhost lain yang ditambah sesudahnya) tidak
>   ada**, jadi hilang saat nginx di-recreate dan domain itu jatuh ke app lama;
> - `up -d` tanpa target mengonvergensi SEMUA service app lama (backend,
>   worker, postgres, …), bukan hanya nginx.
>
> Untuk menambah/mengubah mount vhost di edge, ikuti SOP
> [vps-multi-app-nginx.md §3](vps-multi-app-nginx.md#3-panduan-menambah-aplikasi-baru-app-ke-4-dst):
> cadangkan lalu sunting override yang **ada di VPS** (tambah baris, jangan
> timpa file), periksa dengan `cek_edge`, lalu
> `cek_edge && docker compose up -d --no-deps nginx`.
>
> Pola historis yang sama masih tertulis di `deploy/opsi-b-persistent/README.md`
> (Langkah 2 & Rollback), header `deploy/opsi-b-persistent/docker-compose.override.yml`
> ("Letakkan file ini di …") dan `deploy/DEPLOY-OPSI-B.md` — anggap historis
> juga, jangan dijalankan apa adanya.

Dari repo ini (setelah `git pull` di `/var/www/online-survei`):

```
cd /var/www/online-survei/deploy/opsi-b-persistent
cp survei.populicenter.com.conf  /var/www/survey-populicenter/
cp survei.risetcenter.com.conf   /var/www/survey-populicenter/   # kini isinya 301 redirect
```

Mount kedua conf harus terdaftar di `docker-compose.override.yml` **milik app
lama di VPS** (yang juga memuat mount WA, dst.). **Jangan** menyalin override
dari repo ke sana — cadangkan, lalu tambahkan baris yang kurang saja (SOP di
atas).

Periksa dulu (bash; fungsi `mount_rencana`/`cek_edge` dimuat dari
vps-multi-app-nginx.md §3 langkah 3):

```
cd /var/www/survey-populicenter
source <(sed -n '/^ *# >>> fungsi-edge/,/^ *# <<< fungsi-edge/p' /var/www/online-survei/docs/ops/vps-multi-app-nginx.md)
# Dulu: `docker compose config | grep -A3 conf.d` — JANGAN: tak terbatas ke nginx,
# tak menunjukkan mount yang HILANG (mis. WA), dan keluaran `docker compose config`
# memuat nilai .env (sandi) — jangan tempel ke mana pun.
mount_rencana        # harus memuat SEMUA vhost (wa, survei.*, dst.)
cek_edge             # "<" = mount yang akan HILANG → STOP; ">" = baru
```

Terapkan HANYA bila `cek_edge` tidak mencetak `STOP` (gerbang `&&` menahan
`up` bila ada `STOP` atau fungsi belum dimuat):

```
cd /var/www/survey-populicenter
cek_edge && docker compose up -d --no-deps nginx   # recreate HANYA nginx (dulu: `up -d` tanpa target — JANGAN)
docker compose exec nginx nginx -t && docker compose exec nginx nginx -s reload
cek_edge                                           # sesudahnya harus "SAMA"
```

## 3. VPS — backend/.env aplikasi survei

Edit `/var/www/online-survei/backend/.env` (TIDAK di git):

```
APP_URL=https://survei.populicenter.com
# ALLOWED_ORIGINS: sertakan domain baru. Sertakan domain lama SELAMA masa transisi
# bila masih ada klien/APK yang memanggilnya (redirect 301 tidak berlaku utk XHR).
ALLOWED_ORIGINS=https://survei.populicenter.com,https://survei.risetcenter.com,https://localhost,capacitor://localhost
```

Bila pakai reward IAK: ganti URL callback ke
`https://survei.populicenter.com/api/rewards/callback/iak` dan **daftarkan ulang
di dashboard IAK**.

Terapkan:

```
cd /var/www/online-survei && git pull && docker compose up -d --build backend frontend
```

## 4. Google OAuth & Firebase (agar Login Google web tetap jalan)

- **Google Cloud Console → Credentials → OAuth client WEB** (`403763899450-...`):
  - Authorized JavaScript origins: tambah `https://survei.populicenter.com`.
  - Authorized redirect URIs: tambah bila dipakai.
- **Firebase → Authentication → Settings → Authorized domains**: tambah
  `survei.populicenter.com`.
- Domain lama boleh tetap terdaftar selama transisi.

## 5. Rebuild AAB Android

`frontend/.env.production` sudah menunjuk `https://survei.populicenter.com/api`.
Build ulang:

```
cd frontend && npm run build && npx cap sync android
cd android && ./gradlew bundleRelease
```

AAB sebelumnya (menunjuk risetcenter) JANGAN diunggah.

## 6. Verifikasi

```
# App di domain baru (200 + title "Survei Online")
curl -s https://survei.populicenter.com/ | grep -i '<title>'

# Domain lama redirect (301 → https://survei.populicenter.com/...)
curl -sI https://survei.risetcenter.com/login | grep -i '^location'

# API sehat
curl -s https://survei.populicenter.com/api/health   # atau endpoint publik lain

# App lama risetcenter.com TETAP normal
curl -sI https://risetcenter.com/ | head -1
```

Uji manual: buka `https://survei.populicenter.com` → login Google, isi survei,
terima email OTP (cek logo & tautan email sudah domain baru).

## Rollback cepat

Hapus/timpa `survei.risetcenter.com.conf` dengan versi lama (proxy ke
`survei_frontend`) dan reload nginx; kembalikan `APP_URL`/`ALLOWED_ORIGINS`.
