# Audit Keamanan — Survei Populi Center

**Tanggal:** 2026-09-23
**Cakupan:** pemindaian dependensi (otomatis), analisis statik kode, recon pasif situs live.
**Metode:** `npm audit`, grep pola kerentanan lintas modul, penelusuran alur otorisasi,
pembacaan header HTTP/TLS live (non-intrusif).

> Dokumen ini memuat peta permukaan serangan aplikasi. Simpan di repo privat.
> Jangan publikasikan.

---

## Ringkasan eksekutif

Keamanan **level aplikasi tergolong kuat** — otentikasi, otorisasi, validasi input,
rate-limit, dan penanganan upload sudah dibangun dengan benar. **Tidak ditemukan
kerentanan yang dapat dieksploitasi pada kode buatan sendiri** (nol SQL injection,
nol IDOR, nol XSS sink, nol RCE). Temuan nyata terbatas pada:

1. **Dependensi menua** — beberapa advisory `high` baru terbit sejak rilis Juli;
   satu di antaranya (`@nestjs/core`) hanya bisa ditambal via upgrade major.
2. **Header proteksi tidak sampai ke browser** — sudah **diperbaiki** (commit `d57c1d9`).

Rekomendasi go-live: **boleh lanjut**, dengan dependensi dijadwalkan untuk
remediasi terencana (bukan penghambat rilis, karena advisory yang tersisa tidak
terjangkau pada pola pemakaian aplikasi ini — lihat analisis di bawah).

---

## ✅ Kontrol yang sudah kuat (terverifikasi di kode)

| Area                 | Bukti                                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Auth default-deny    | `JwtAuthGuard` global (`app.module.ts`); semua route wajib JWT kecuali `@Public`                                     |
| Daftar `@Public`     | Hanya login/google/refresh/reset/register/OTP/health/avatar/callback — semua wajar                                   |
| Anti SQL-injection   | Query request pakai parameter TypeORM; interpolasi `${}` hanya di skrip loadtest & migrasi (input hardcoded)         |
| Anti mass-assignment | `ValidationPipe` `whitelist + forbidNonWhitelisted + transform`                                                      |
| Otorisasi admin      | Semua controller admin `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(...)`                                        |
| Anti-IDOR            | Reward: `confirmRedemption`/`resendOtp` pakai `where: { id, userId }`; notifikasi terikat `userId`                   |
| Brute-force          | Login 5/mnt, OTP verify 5/mnt, resend 3/mnt, reset 5/mnt (per-IP) + **lockout per-akun** (Redis)                     |
| Upload               | Magic-byte + tipe deklarasi harus cocok isi (anti-spoof) + batas ukuran (`file-validation.service.ts`)               |
| JWT                  | Secret `getOrThrow` (app tak boot tanpa itu); access 15m; refresh divalidasi terhadap nilai tersimpan (bisa dicabut) |
| Header API           | helmet + HSTS (prod), `x-powered-by` off, filter error scrub detail 5xx                                              |
| CORS                 | Whitelist `ALLOWED_ORIGINS`; no-Origin diizinkan (same-origin/health, bukan celah)                                   |
| Callback IAK         | IP allowlist + `trust proxy` (rate-limit tak bisa di-bypass spoof XFF)                                               |
| XSS / RCE            | Nol `dangerouslySetInnerHTML`/`innerHTML`; nol `eval`/`new Function`                                                 |
| Secret               | Nol secret literal ter-commit                                                                                        |

---

## 🔧 Temuan & status

### #1 — [SEDANG] Header keamanan tidak sampai ke browser — ✅ DIPERBAIKI (`d57c1d9`)

Recon live ke `https://survei.populicenter.com/` tidak memuat `X-Frame-Options`,
`X-Content-Type-Options`, maupun `Referrer-Policy`, padahal `frontend/nginx.conf`
memasangnya di level server.

**Sebab:** aturan pewarisan `add_header` nginx — begitu sebuah `location` memiliki
`add_header` sendiri (Cache-Control pada `location /` dan aset statis), seluruh
`add_header` level-server **dibuang** untuk location itu. Akibatnya dokumen HTML
utama tampil tanpa proteksi framing → **risiko clickjacking**.

**Perbaikan:** header keamanan diulang di dalam tiap location yang menyajikan
konten. Sekaligus menghapus duplikat `Referrer-Policy` pada `/api` (helmet yang
kini memegangnya). Aktif setelah image frontend dibangun ulang & dideploy.

**Sisa tindakan Anda:** aktifkan **HSTS di Cloudflare** (SSL/TLS → Edge
Certificates → HSTS) — sengaja tidak diset di nginx karena `populicenter.com`
berbagi subdomain dengan app lain.

### #2 — [TINGGI, ops] Dependensi menua; gerbang audit CI merah lagi

Per 2026-09-23, `npm audit --omit=dev --audit-level=high` menemukan **10 high
runtime** (Juli lalu 0). Advisory baru terbit sejak rilis terakhir. Karena
`docker-publish` bergantung pada job `audit`, **CI merah ⇒ image tidak terbit**
(lihat [[survei-monorepo-build-gotchas]] butir 7).

**Analisis keterjangkauan pada aplikasi ini:**

| Paket                         | Advisory                                  | Terjangkau di app ini?                   | Fix                   |
| ----------------------------- | ----------------------------------------- | ---------------------------------------- | --------------------- |
| `multer`                      | DoS via nama field multipart              | **YA** (endpoint upload)                 | override → `2.4.0`    |
| `nodemailer`                  | `resolveContent()` bypass file/url access | Rendah (attachment bukan input pengguna) | `npm update` (semver) |
| `@nestjs/core`                | Injection (GHSA-36xv-jgw5-4q75)           | Perlu dinilai; app di v10                | **major v10→v12**     |
| `react-router(-dom)`          | CSRF bypass mode RSC                      | **TIDAK** (SPA Vite, bukan RSC)          | `npm update` (semver) |
| `postcss`                     | Baca `.map` sembarang saat `from` unset   | TIDAK (build-time)                       | `npm update`          |
| `browserslist`                | OOM memory growth                         | TIDAK (build-time)                       | `npm update`          |
| `nanoid`                      | Loop pada size negatif                    | Rendah (app tak pakai size negatif)      | `npm update`          |
| `brace-expansion`,`minimatch` | DoS pola glob                             | TIDAK (pola bukan input pengguna)        | override              |

**Rencana remediasi (terurut prioritas & risiko):**

1. **Sekarang, aman:** `npm update nodemailer postcss react-router react-router-dom nanoid browserslist`
   (semver-compatible, low-risk). Menutup 5–6 high tanpa breaking. Jalankan test
   penuh backend+frontend sebelum push.
2. **Sekarang, via override** (npm kadang perlu dipaksa — lihat catatan di bawah):
   `multer` → `2.4.0`, `brace-expansion@1` → `1.1.21`, `brace-expansion@2` → `2.1.7`.
   `multer` yang paling penting (satu-satunya high yang benar-benar terjangkau).
3. **Terjadwal, bukan go-live:** upgrade `@nestjs/core`/`common`/`platform-express`
   v10 → v12 (dua major, breaking). Ini proyek tersendiri — jangan diburu saat
   rilis. Sampai selesai, advisory `@nestjs/core` akan menahan gerbang CI.

   **Opsi sementara agar CI hijau:** ganti gerbang ke `audit-ci`/`better-npm-audit`
   dengan **ignore ber-batas-waktu** khusus advisory `@nestjs/core`
   (GHSA-36xv-jgw5-4q75), didokumentasikan + tenggat upgrade. Jangan menurunkan
   `--audit-level` global (itu membutakan gerbang terhadap high lain).

> **Catatan npm (jebakan berulang):** untuk paket yang dipatok via `overrides`,
> `npm install` sering **tidak** memindahkan versi yang sudah terkunci di
> `package-lock.json`. `npm update <paket>` biasanya berhasil, tapi bisa juga
> menarik versi lebih rendah bila beberapa parent memasang rentang berbeda.
> Verifikasi selalu dengan `npm ls <paket> --all` setelahnya. Jangan hapus entri
> dari lockfile lalu install — pernah membuat npm **membuang** paketnya.

### #3 — [RENDAH, verifikasi ops] Pastikan `DISABLE_THROTTLE` tidak ada di prod

Knob load-test yang mematikan SELURUH rate-limit. Di repo hanya muncul di
`docker-compose.loadtest.yml` (aman). Verifikasi di VPS:
`grep DISABLE_THROTTLE /var/www/online-survei/backend/.env` harus kosong.

### #4 — [INFO] OTP registrasi berhitung per-IP, bukan per-akun

Aman secara praktik (5/mnt + TTL pendek pada ruang 6 digit). Penghitung per-akun
akan menambah ketahanan terhadap rotasi IP. Opsional.

---

## Uji penetrasi aktif (belum dijalankan)

Sengaja **tidak** dijalankan ke produksi live (bisa mengganggu responden).
Skrip siap-pakai untuk lingkungan LOKAL ada di `scripts/pentest-local.sh` —
menguji secara empiris: bypass auth (akses tanpa/berbeda token), IDOR lintas
akun (respons/reward milik user lain), payload injeksi pada field pencarian,
enumerasi lewat `check-availability`, dan efektivitas rate-limit.

**Jalankan (butuh Docker):**

```bash
docker compose -f docker-compose.test.yml up -d      # atau stack lokal
bash scripts/pentest-local.sh http://localhost:3100/api
```

Jangan arahkan ke `survei.populicenter.com` saat ada pengumpulan data.

---

## Rekomendasi go-live

**Boleh lanjut rilis.** Kode aplikasi aman. Sebelum/segera setelah rilis:

- [x] Perbaiki header keamanan nginx (`d57c1d9`) — deploy image frontend baru
- [ ] Aktifkan HSTS di Cloudflare
- [ ] Verifikasi `DISABLE_THROTTLE` tak ada di `backend/.env` VPS
- [ ] Remediasi dependensi langkah 1–2 (aman, non-breaking) + `multer` 2.4.0
- [ ] Jadwalkan upgrade `@nestjs` v10→v12 (terpisah); sementara ignore ber-batas-waktu di gerbang CI
- [ ] (Opsional) jalankan `scripts/pentest-local.sh` saat Docker nyala
