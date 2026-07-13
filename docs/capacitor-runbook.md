# Runbook Capacitor — Android/iOS + Notifikasi

Membungkus aplikasi web (React + Vite) menjadi aplikasi native dengan **Capacitor**,
plus model **pop-up & notifikasi**. Tidak menulis ulang UI — memakai build `dist/`.

Status: **Stage A & B selesai** (integrasi web + pop-up in-app + jembatan push +
backend device-token & kirim FCM). Sisa: jalankan `cap add`, isi
`FIREBASE_SERVICE_ACCOUNT`, dan setel google-services.json/APNs (lihat §5 & §6).

---

## 1. Konsep notifikasi (jawaban "pop up & notifikasi bagaimana")

Ada **tiga** jenis, jangan tertukar:

| Jenis                        | Muncul kapan                      | Siapa menampilkan  | Di kode ini                                 |
| ---------------------------- | --------------------------------- | ------------------ | ------------------------------------------- |
| **Notifikasi sistem (push)** | Aplikasi **di belakang/tertutup** | OS (status bar HP) | Dikirim server via FCM/APNs (Stage B)       |
| **Pop-up in-app**            | Aplikasi **sedang dibuka**        | Aplikasi sendiri   | `NotificationHost` + `showAppNotice()`      |
| **Local notification**       | Dijadwalkan di perangkat          | OS                 | `@capacitor/local-notifications` (opsional) |

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
showAppNotice({
  title: 'Survei baru tersedia',
  body: 'Survei Kepuasan 2026',
  link: '/surveys/abc/fill',
  tone: 'info',
});
```

---

## 2. Prasyarat (mesin developer)

- Node.js (sudah).
- **Android**: Android Studio + JDK 17.
- **iOS**: hanya di **macOS** dengan Xcode + akun Apple Developer ($99/th).

## 2b. ⚠️ WAJIB untuk build native (2 hal — kalau tidak, aplikasi blank/gagal)

Berbeda dari web, aplikasi native memanggil server dari origin lokal, jadi:

1. **URL API absolut.** Saat build native, set di `frontend/.env.production`:

   ```bash
   VITE_API_BASE_URL=https://survei.populicenter.com/api
   ```

   (Di web ini kosong → otomatis `/api` relatif. Native WAJIB absolut — tanpa ini
   semua panggilan API gagal karena `/api` menunjuk ke dalam app.)

2. **Izinkan origin aplikasi di CORS backend.** Di `backend/.env` VPS, tambahkan
   origin Capacitor ke `ALLOWED_ORIGINS`:
   ```bash
   ALLOWED_ORIGINS=https://survei.populicenter.com,https://localhost,capacitor://localhost
   ```
   Lalu `docker compose up -d backend`. (Android pakai `https://localhost`, iOS
   `capacitor://localhost`.)

## 3. Tambah platform native (sekali saja)

Dari folder `frontend/`:

```bash
npm i -D @capacitor/android @capacitor/ios
npx cap add android
npx cap add ios          # hanya di macOS
```

> Folder `frontend/android` & `frontend/ios` di-generate lokal (di-`.gitignore`).
> `capacitor.config.ts` sudah ada (appId `com.populicenter.survei`, webDir `dist`).
> Pastikan §2b sudah dikerjakan SEBELUM `npm run cap:android` (URL API di-bake saat build).

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

**Stage B sudah DIBANGUN** (commit Stage B). Yang ada di kode:

1. ✅ **Tabel `device_token`** (`user_id`, `token` unik, `platform`, `created_at`,
   `last_seen_at`) — migrasi `1715000038000`.
2. ✅ **Endpoint** `POST /notifications/device-token` (auth, semua peran) — upsert
   token. Aplikasi Capacitor memanggilnya otomatis saat daftar push.
3. ✅ **Modul kirim push** `PushService` (firebase-admin / FCM → Android & iOS).
4. ✅ **Pemicu**: tombol **"Kirim Undangan"** kini juga mengirim **push** ke
   perangkat responden yang belum mengisi, `data.link=/surveys/<id>/fill`.
   Token kedaluwarsa dibersihkan otomatis.

**Yang HARUS Anda siapkan agar push aktif** (tanpa ini, fitur lain tetap jalan —
push hanya non-aktif & dicatat warn):

- Buat **service account** di Firebase Console (Project Settings → Service accounts
  → Generate new private key) → dapat file JSON.
- Set env di `backend/.env` (VPS):
  ```bash
  FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"...", ... }
  ```
  (tempel seluruh isi JSON dalam SATU baris). Lalu `docker compose up -d backend`.
- Android: `google-services.json` di `frontend/android/app/` (untuk FCM di sisi app).
- iOS: APNs key di Firebase + entitlement Push di Xcode.

> **Catatan keamanan:** `FIREBASE_SERVICE_ACCOUNT` adalah rahasia — hanya di `.env`
> server, JANGAN commit.

Belum termasuk (opsional, mudah ditambah): push juga pada reminder H-3/H-1;
hapus token saat logout; fitur Pengumuman/Berita untuk push non-survei.

---

## 7. Hal lain

- **Ikon & splash**: `@capacitor/assets` untuk generate dari satu gambar.
- **Signing/rilis**: Android pakai keystore (`*.jks`, jangan masuk git);
  iOS pakai signing Xcode.
- **Update OTA konten web**: karena UI = web, banyak pembaruan cukup lewat web
  build + `cap sync` (rilis ulang biner hanya bila ganti plugin native/izin).
