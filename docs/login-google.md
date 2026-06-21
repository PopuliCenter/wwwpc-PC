# Login dengan Google — Setup

Login Google sudah terpasang (web). Tombol "Masuk dengan Google" muncul di halaman
login **hanya bila** `VITE_GOOGLE_CLIENT_ID` diset. Akun baru via Google otomatis
berperan **responden**, email terverifikasi, lalu **digerbang melengkapi data diri**
sebelum bisa mengisi survei (lihat gerbang data diri).

## 1. Buat OAuth Client ID (Google Cloud)
1. Buka <https://console.cloud.google.com> → buat/ pilih project.
2. **APIs & Services → OAuth consent screen**: isi nama aplikasi, dukungan email,
   dll. (External, mode Production atau Testing).
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized JavaScript origins** (WAJIB untuk Google Identity Services):
     - `https://survei.risetcenter.com`
     - `http://localhost:5173` (saat dev)
   - **Authorized redirect URIs**: tidak perlu (GIS memakai ID token, bukan redirect).
4. Salin **Client ID** (bentuk `xxxxx.apps.googleusercontent.com`).

## 2. Set environment
Pakai **Client ID yang sama** di backend (verifikasi audience) dan frontend (render tombol).

- **Backend** `backend/.env` (VPS):
  ```bash
  GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
  ```
- **Frontend** — variabel Vite **build-time** (di-embed saat build image). Buat file
  **`frontend/.env.production`** (BUKAN `.env` — `.dockerignore` mengecualikan `.env`
  & `**/.env`, tapi TIDAK `.env.production`; Vite memuat `.env.production` otomatis
  saat `vite build`):
  ```bash
  # /var/www/online-survei/frontend/.env.production
  VITE_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
  ```
  > Client ID Google **bukan rahasia** (memang ikut ter-embed di bundel browser),
  > jadi aman ada di file ini. Karena di-embed saat build, frontend **harus di-build
  > ulang** setelah menambah/mengubahnya (`docker compose up -d --build frontend`).

## 3. Deploy
```bash
cd /var/www/online-survei && git pull
docker compose up -d --build backend frontend
```
Migrasi `1715000039000` (phone jadi nullable — akun Google tanpa nomor HP) jalan
otomatis saat backend start.

## 4. Uji
- Buka halaman login → muncul tombol Google → masuk dengan akun Google.
- Akun baru → diarahkan ke **Lengkapi Data Diri** → setelah lengkap bisa isi survei.
- Akun email yang sudah ada (email sama) → **ditautkan** otomatis (login tanpa password).

## Catatan
- Backend `POST /auth/google` memverifikasi ID token (audience = `GOOGLE_CLIENT_ID`).
  Bila env kosong → endpoint membalas jelas "Login Google belum dikonfigurasi".
- **Penautan akun**: berdasarkan email terverifikasi Google. Bila admin/responden
  sudah punya akun dengan email itu, login Google masuk ke akun tersebut.
- Email/password + OTP tetap berfungsi sebagai alternatif.
- **Capacitor (native Android/iOS)** nanti perlu OAuth client Android/iOS terpisah
  + plugin Google Sign-In native (tombol GIS web ini untuk browser/PWA). Menyusul
  saat membungkus aplikasi (lihat docs/capacitor-runbook.md).
