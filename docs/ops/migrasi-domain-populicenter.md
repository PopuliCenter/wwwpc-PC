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

Dari repo ini (setelah `git pull` di `/var/www/online-survei`):

```
cd /var/www/online-survei/deploy/opsi-b-persistent
cp survei.populicenter.com.conf  /var/www/survey-populicenter/
cp survei.risetcenter.com.conf   /var/www/survey-populicenter/   # kini isinya 301 redirect
```

`docker-compose.override.yml` app lama sudah diperbarui di repo untuk mount kedua
conf. Salin juga bila belum ada di app lama, lalu terapkan:

```
cd /var/www/survey-populicenter
docker compose config | grep -A3 conf.d          # verifikasi kedua conf ter-mount
docker compose up -d                             # re-create nginx app lama
docker compose exec nginx nginx -t && docker compose exec nginx nginx -s reload
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
