# Runbook Capacitor — Android/iOS + Notifikasi

Membungkus aplikasi web (React + Vite) menjadi aplikasi native dengan **Capacitor**,
plus model **pop-up & notifikasi**. Tidak menulis ulang UI — memakai build `dist/`.

Status: **Stage A selesai** (integrasi web + pop-up in-app + jembatan push).
**Stage B** (backend kirim push via FCM) = langkah berikutnya, lihat bagian akhir.

---

## 1. Konsep notifikasi (jawaban "pop up & notifikasi bagaimana")

Ada **tiga** jenis, jangan tertukar:

| Jenis | Muncul kapan | Siapa menampilkan | Di kode ini |
|---|---|---|---|
| **Notifikasi sistem (push)** | Aplikasi **di belakang/tertutup** | OS (status bar HP) | Dikirim server via FCM/APNs (Stage B) |
| **Pop-up in-app** | Aplikasi **sedang dibuka** | Aplikasi sendiri | `NotificationHost` + `showAppNotice()` |
| **Local notification** | Dijadwalkan di perangkat | OS | `@capacitor/local-notifications` (opsional) |

**Poin penting yang sering jadi pertimbangan:** saat push tiba **ketika aplikasi
sedang dibuka (foreground)**, OS sering TIDAK menampilkan banner. Maka push yang
diterima di foreground kita tampilkan sebagai **pop-up in-app** sendiri
(`pushNotificationReceived` → `showAppNotice`). Saat aplikasi di belakang lalu
notifikasi **diketuk**, aplikasi membuka rute tujuan (`pushNotificationActionPerformed`
→ `router.navigate(link)`, mis. langsung ke `/surveys/<id>/fill`).

Pop-up in-app (`showAppNotice`) juga bisa dipakai untuk pesan biasa (info/sukses/
error) dan **berfungsi di web maupun native** — tidak butuh izin OS.

Contoh memunculkan pop-up dari mana saja:
```ts
import { showAppNotice } from '@/stores/notification.store';
showAppNotice({ title: 'Survei baru tersedia', body: 'Survei Kepuasan 2026', link: '/surveys/abc/fill', tone: 'info' });
```

---

## 2. Prasyarat (mesin developer)
- Node.js (sudah).
- **Android**: Android Studio + JDK 17.
- **iOS**: hanya di **macOS** dengan Xcode + akun Apple Developer ($99/th).

## 3. Tambah platform native (sekali saja)
Dari folder `frontend/`:
```bash
npm i -D @capacitor/android @capacitor/ios
npx cap add android
npx cap add ios          # hanya di macOS
```
> Folder `frontend/android` & `frontend/ios` di-generate lokal (di-`.gitignore`).
> `capacitor.config.ts` sudah ada (appId `com.populicenter.survei`, webDir `dist`).

## 4. Build & jalankan
```bash
npm run cap:android      # build web → sync → buka Android Studio
npm run cap:ios          # (macOS) build web → sync → buka Xcode
```
Di Android Studio/Xcode: tekan Run untuk emulator/perangkat, atau Build untuk APK/AAB.
Setiap habis mengubah kode web: `npm run cap:sync`.

## 5. Aktifkan Push (FCM/APNs)
Plugin `@capacitor/push-notifications` sudah terpasang & ter-wire di
`src/services/notifications.ts`.

**Android (FCM):**
1. Buat project di **Firebase Console** → tambah app Android (package
   `com.populicenter.survei`).
2. Unduh **`google-services.json`** → taruh di `frontend/android/app/`.
3. (Plugin sudah menambah dependency Gradle yang diperlukan saat `cap sync`.)

**iOS (APNs):**
1. Di Apple Developer, aktifkan **Push Notifications** untuk App ID.
2. Tambah app iOS di Firebase, unggah **APNs key**, taruh `GoogleService-Info.plist`
   di proyek iOS.
3. Di Xcode: tab Signing & Capabilities → tambah **Push Notifications** +
   **Background Modes → Remote notifications**.

Saat aplikasi dijalankan, ia akan minta izin, mendaftar, dan mengirim **device
token** ke backend `POST /notifications/device-token` (perlu Stage B agar token
disimpan & dipakai).

---

## 6. Stage B — Backend kirim push (langkah berikutnya)

Agar notifikasi "survei baru" benar-benar sampai ke HP saat aplikasi tertutup,
backend perlu:

1. **Tabel `device_token`** — `user_id`, `token` (unik), `platform`, `created_at`,
   `last_seen_at`. + migrasi.
2. **Endpoint** `POST /notifications/device-token` (auth) — upsert token milik user.
   (Frontend sudah memanggilnya.)
3. **Modul kirim push** — pakai `firebase-admin` (FCM mendukung Android & iOS via
   APNs sekaligus). Env: `FIREBASE_SERVICE_ACCOUNT` (JSON service account).
4. **Pemicu** — saat admin menekan **"Kirim Undangan"** atau survei diaktifkan,
   selain email, kirim push ke device token responden sasaran dengan `data.link =
   /surveys/<id>/fill`.
5. (Opsional) Hapus token saat logout / saat FCM melaporkan token kedaluwarsa.

Catatan: alur email undangan sudah ada (tombol "Kirim Undangan"); push tinggal
"menumpang" pemicu yang sama. Lihat
[notifikasi-undangan-survei](../) (memori proyek) & `notification.module.ts`.

---

## 7. Hal lain
- **Ikon & splash**: `@capacitor/assets` untuk generate dari satu gambar.
- **Signing/rilis**: Android pakai keystore (`*.jks`, jangan masuk git);
  iOS pakai signing Xcode.
- **Update OTA konten web**: karena UI = web, banyak pembaruan cukup lewat web
  build + `cap sync` (rilis ulang biner hanya bila ganti plugin native/izin).
