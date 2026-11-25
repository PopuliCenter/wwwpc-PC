# Rilis & notifikasi update aplikasi Android

App Android memuat tampilan web yang **dibundel di APK** (`webDir: dist`).
Akibatnya, perbaikan di frontend baru sampai ke responden setelah mereka
memasang APK baru. Versi web tidak terpengaruh, karena selalu terbaru
(PWAReloadPrompt).

## Cara kerja

| Bagian                                  | Isi                                                                                                                                                             |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin → **Rilis Aplikasi**              | Catat kode versi, nama versi, link unduhan, catatan rilis, opsi _wajib update_, dan opsi _umumkan_.                                                             |
| `GET /api/app/version?platform=android` | Endpoint publik, di-cache 30 dtk. Isinya versi terbaru, versi minimum (rilis wajib update terakhir), dan link.                                                  |
| App Android                             | Mengecek saat dibuka dan saat kembali ke depan (maks. sekali per 15 menit) dengan membandingkan `versionCode` APK.                                              |
| Versi < minimum                         | Layar **wajib update** yang tidak bisa ditutup. Tetap muncul saat offline (info terakhir di-cache). Data lokal aman karena update APK tidak menghapus data app. |
| Versi < terbaru                         | Dialog **Versi baru tersedia** dengan tombol _Perbarui_ / _Nanti_ (Nanti = tunda 24 jam untuk versi itu). Tidak menyela halaman isi survei.                     |
| Umumkan                                 | Lonceng + push ke semua user aktif yang punya perangkat Android. Ketuk → `/app-update` → tombol _Perbarui_.                                                     |
| Tombol _Perbarui_                       | Membuka link di luar app. Link `populicenter.org` dibuka di browser; link `play.google.com` langsung membuka aplikasi Play Store.                               |

Link unduhan wajib https ke domain izin (env `APP_DOWNLOAD_ALLOWED_HOSTS`,
default `populicenter.org,play.google.com`, subdomain ikut).

## Langkah rilis

1. Naikkan `appVersionCode` (+1) dan `appVersionName` di
   `frontend/android/app/build.gradle`.
2. Build:
   ```bash
   cd frontend && npm run build && npx cap sync android
   ```
   Lalu buat APK/AAB release yang ditandatangani (lihat
   [checklist-rilis.md](checklist-rilis.md)).
3. Unggah APK ke halaman unduhan di **populicenter.org**. Sertakan versi dan
   panduan "izinkan instal dari sumber ini".
4. **Setelah link bisa diunduh**, buka admin → Rilis Aplikasi:
   - kode/nama versi = angka di langkah 1;
   - link = halaman unduhan;
   - centang _Wajib update_ hanya bila ada perbaikan di sisi app yang harus
     dipasang semua orang, misalnya bug pengisian atau perubahan API yang
     memutus versi lama;
   - centang _Umumkan_ untuk mengirim lonceng + push.
5. Salah input? Hapus catatan rilisnya. APK di HP pengguna tidak terpengaruh.

> ⚠️ Jangan catat rilis _wajib update_ sebelum APK-nya benar-benar bisa
> diunduh. Kalau tidak, semua pengguna versi lama terkunci tanpa jalan keluar.

## Pindah ke Google Play

- Di rilis berikutnya, pilih link **Google Play** di form. Tombol _Perbarui_
  lalu langsung membuka listing app di Play Store.
- Kebijakan Play melarang app dari Play memperbarui diri lewat jalur selain
  Play. Jadi begitu app ada di Play, link rilis harus link Play, jangan link
  APK website.
- **Tanda tangan:** Play App Signing menandatangani ulang app dengan kunci
  Google. APK website yang ditandatangani upload key **tidak bisa** menimpa
  versi Play, begitu juga sebaliknya. Bila website tetap menyediakan APK, unggah
  _signed universal APK_ dari Play Console (App bundle explorer). Dengan begitu
  pengguna lama versi website bisa pindah ke Play tanpa uninstall.
- **Update langsung di dalam app** (tanpa membuka Play Store) bisa ditambah
  nanti dengan Play In-App Updates API. Butuh plugin native, misalnya
  `@capawesome/capacitor-app-update`, dan hanya berlaku untuk instalasi dari
  Play.

## Developer verification Android

Berlaku di Indonesia sejak **30 Sep 2026**. Paket `com.populicenter.survei`
harus terdaftar atas nama developer terverifikasi di Play Console, termasuk
APK yang dibagikan **di luar** Play (Play Console → daftarkan app yang
didistribusikan di luar Google Play). Tanpa itu, instalasi baru di HP
bersertifikat bisa diblokir.
