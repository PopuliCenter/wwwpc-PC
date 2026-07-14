# Checklist Rilis Play Store — Aplikasi Survei Populi

Status item yang sudah disiapkan di repo ditandai ✅. Sisanya tindakan manual.

## 1. Penandatanganan (signing)

- ✅ `signingConfig release` di `frontend/android/app/build.gradle` (baca dari
  `keystore.properties`, gitignored).
- ✅ Template `frontend/android/keystore.properties.example`.
- ☐ Buat keystore (dari `frontend/android/`):
  ```
  keytool -genkey -v -keystore populi-survei-release.jks \
    -keyalg RSA -keysize 2048 -validity 10000 -alias populi-survei
  ```
- ☐ Salin `keystore.properties.example` → `keystore.properties`, isi password.
- ☐ **Simpan keystore + password di tempat aman** (hilang = tak bisa update app).
- ☐ Aktifkan **Play App Signing** saat upload pertama.

## 2. Firebase & login (GOTCHA paling sering)

- ☐ Ambil SHA-1 & SHA-256 **upload key**:
  `keytool -list -v -keystore populi-survei-release.jks -alias populi-survei`
- ☐ Daftarkan SHA tsb ke **Firebase** (project settings → app Android).
- ☐ Setelah upload pertama, ambil SHA-1 **App Signing key** dari Play Console
  (Setup → App integrity) dan daftarkan JUGA ke Firebase + OAuth client Android.
  > Tanpa ini: Google login & push notification MATI di build dari Play Store.
- ☐ Pastikan `google-services.json` produksi ada di `frontend/android/app/`.
- ☐ Layar persetujuan OAuth Google: mode Production + URL kebijakan privasi.

## 3. Izin & hardening

- ✅ `POST_NOTIFICATIONS` & `RECORD_AUDIO` ditambahkan ke AndroidManifest.
- ✅ `android:allowBackup="false"`.
- ✅ R8 `minifyEnabled true` + `shrinkResources true` + keep-rules Capacitor/plugin.
  > ☐ **Uji build rilis** (Generate Signed Bundle → jalankan) — pastikan login,
  > push, GPS, kamera, audio, upload tetap berfungsi. Bila bermasalah, set
  > `minifyEnabled false` sementara.
- ✅ Lokasi hanya foreground (tak ada background location).
- ☐ targetSdk 36 (sudah memenuhi syarat Play).

## 4. Versi

- ✅ **Otomatis** — `frontend/android/app/build.gradle`:
  - `versionCode` = jumlah commit git (`git rev-list --count HEAD`) → naik sendiri
    tiap commit, tidak perlu dinaikkan manual.
  - `versionName` = `version` di `frontend/package.json` (naikkan di sini untuk
    rilis baru, mis. 1.0.0 → 1.1.0).
  > Jangan menulis ulang riwayat git (squash/rebase yang mengurangi jumlah commit)
  > — versionCode bisa turun dan Play akan menolak upload.

## 5. Legal & kebijakan

- ✅ Draf [Kebijakan Privasi](kebijakan-privasi.md) — publikasikan ke URL publik.
- ✅ Draf [Penghapusan Akun](penghapusan-akun.md) — publikasikan ke URL publik.
- ✅ Fitur **Hapus Akun** in-app (Profil → Hapus Akun) + endpoint `DELETE /users/me`.
- ✅ Acuan [Data Safety](data-safety.md) untuk form Play Console.
- ☐ Isi **Content rating** (kuesioner IARC).
- ☐ Listing menjelaskan poin→pulsa/e-wallet sebagai insentif survei (bukan judi).

## 6. Aset store listing

- ☐ Ikon 512×512 (PNG), feature graphic 1024×500.
- ☐ Min. 2 screenshot HP (disarankan 4–8).
- ☐ Judul, deskripsi singkat (≤80 char) & lengkap, kategori, email kontak.

## 7. Akun & proses rilis

- ☐ Akun Google Play Developer ($25) + **verifikasi identitas** (butuh waktu).
- ☐ **Closed testing**: untuk akun personal baru, wajib ≥12 tester selama 14
  hari sebelum boleh rilis Production.
- ☐ **App access**: beri akun tester (email+password responden) untuk reviewer.
- ☐ Build **AAB** rilis (Android Studio → Build → Generate Signed App Bundle).
- ☐ Internal testing → Closed testing (14 hari) → Production.
- ☐ Cek **Pre-launch report** (crash/ANR).

## 8. Backend kesiapan

- ☐ `survei.risetcenter.com` HTTPS stabil (Cloudflare) — sudah.
- ☐ `RESEND_API_KEY`, `FIREBASE_SERVICE_ACCOUNT`, `REWARD_PROVIDER`/`IAK_*` terisi
  di `backend/.env` produksi.
- ☐ Migrasi terbaru ter-deploy (`docker compose up -d --build`).

## Build cepat AAB rilis

```
cd frontend
npm run build && npx cap sync android
# lalu di Android Studio: Build → Generate Signed App Bundle → release
```
