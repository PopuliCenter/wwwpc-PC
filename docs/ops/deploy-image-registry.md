# Deploy via Image Registry (GHCR) — tanpa build di VPS

Setiap push ke `main` mendapat **run CI sendiri** (run main tidak saling
membatalkan). Bila seluruh uji lolos (lint, test, e2e, backup-roundtrip, audit),
dua job terakhir berjalan:

| Image                                  | Tag            | Dipasang oleh job        | Arti                                                                |
| -------------------------------------- | -------------- | ------------------------ | ------------------------------------------------------------------- |
| `ghcr.io/populicenter/survei-backend`  | `sha-<commit>` | **Publish image (GHCR)** | image persis commit itu — bahan rollback                            |
| `ghcr.io/populicenter/survei-frontend` | `sha-<commit>` | **Publish image (GHCR)** | idem                                                                |
| keduanya                               | `latest`       | **Promosikan latest**    | commit terbaru (dalam sejarah `main`) yang lolos CI — deploy normal |

`docker-compose.yml` sudah menunjuk image ini (`IMAGE_TAG` default `latest`).
Blok `build:` tetap ada sebagai fallback.

Cara kerja `latest`:

- Run main berjalan paralel, jadi urutan selesainya acak. Job **Promosikan
  latest** membaca commit yang sedang dipegang `latest` backend **dan**
  frontend (label `org.opencontainers.image.revision` di image) dan hanya
  memindahkan `latest` bila commit run ini **keturunan** keduanya. Run commit
  lama yang selesai belakangan dilewati (`::notice::` di log) — `latest` tidak
  mundur.
- Promosi berjalan berurutan (satu grup concurrency, antre s.d. 100).
- Satu `git push` berisi beberapa commit = satu event push → **hanya commit
  teratas** yang dibangun. Commit di bawahnya tidak punya `sha-<commit>`.
- Commit yang gagal CI tidak menerbitkan image; `latest` tetap di commit lolos
  sebelumnya.
- **Run manual** (Actions → CI → Run workflow, cabang `main`) membangun ulang
  `sha-<HEAD main>` lalu mempromosikannya — dipakai saat yang berubah hanya
  konfigurasi build (mis. variable `VITE_GOOGLE_CLIENT_ID`). Tag `sha-<commit>`
  yang sama ditimpa build baru (kode sama, konfigurasi build baru).
- **Jangan Re-run** run CI dari commit sebelum job "Promosikan latest" ada:
  workflow lamanya menimpa `latest` langsung (tanpa label). Bila terlanjur,
  jalankan Run workflow di `main`.

## Setup sekali di VPS (login GHCR)

Package GHCR mengikuti visibilitas repo (privat), jadi VPS perlu login sekali:

1. GitHub → Settings (akun) → Developer settings → **Personal access tokens →
   Tokens (classic)** → Generate new token → centang **`read:packages`** saja.
2. Di VPS:
   ```bash
   docker login ghcr.io -u <username-github>
   # Password: tempel PAT read:packages
   ```
   Kredensial tersimpan di `~/.docker/config.json` — cukup sekali.

## Deploy normal (menggantikan `--build`)

```bash
cd /var/www/online-survei
git pull                                   # compose file / conf / skrip terbaru
grep -q '^IMAGE_TAG=' .env && echo "PERINGATAN: rollback masih terkunci di .env — lihat Rollback"
bash scripts/backup.sh                     # WAJIB bila rilis membawa migrasi DB (bahan rollback)
docker compose pull backend frontend && docker compose up -d --no-build backend frontend
```

Lebih cepat (VPS tak lagi mengompilasi), dan image yang jalan **persis** yang
sudah lolos CI. `pull` gagal → `up` tidak dijalankan; `unauthorized`/`denied`
= login GHCR kedaluwarsa (ulangi Setup). `--no-build` mencegah compose diam-diam
mem-build dari kode lokal bila image tak tersedia (teruji: tanpa flag ini
`up` mem-build lalu menjalankannya dengan nama tag registry).

> ⚠️ Tunggu job **"Promosikan latest"** selesai (bukan hanya "Publish image")
> sebelum `pull` — kalau tidak, yang tertarik masih `latest` lama. Cek: GitHub →
> Actions → run commit tsb → ringkasan job menulis `DIPROMOSIKAN` / `DILEWATI`.
> `DILEWATI` = run commit yang lebih baru sudah memasang `latest` (atau, jarang,
> commit ini sudah tak ada di `main` karena force-push — lihat peringatan di log).

Cek commit yang sedang jalan / yang dipegang `latest` (image sebelum perubahan
ini belum berlabel → keluaran kosong):

```bash
# container yang sedang jalan
docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' survei_backend
# latest yang sudah ditarik (`docker compose pull`)
docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' ghcr.io/populicenter/survei-backend:latest
```

## Rollback cepat ke commit sebelumnya

```bash
cd /var/www/online-survei
SHA=$(git rev-parse --verify <commit>) \
  && IMAGE_TAG=sha-$SHA docker compose pull backend frontend \
  && sed -i '/^IMAGE_TAG=/d' .env && printf '\nIMAGE_TAG=sha-%s\n' "$SHA" >> .env \
  && docker compose up -d --no-build backend frontend
```

(`<commit>` = SHA dari `git log` / halaman Actions; SHA pendek pun boleh.)
Rantai `&&` berhenti di langkah pertama yang gagal — container tidak berubah:

- `pull` gagal dengan `not found` / `manifest unknown` → commit itu tidak punya
  image (bagian bawah push multi-commit, gagal CI, atau sebelum job "Promosikan
  latest" ada run main masih saling membatalkan); pilih commit lain.
  `unauthorized` / `denied` → login GHCR kedaluwarsa (ulangi Setup).
- Baris `IMAGE_TAG=` di `.env` root membuat rollback **menempel**. Tanpanya,
  `docker compose up` berikutnya tanpa `IMAGE_TAG` (termasuk dari panduan lain)
  diam-diam mengembalikan container itu ke `latest` → backend & frontend beda
  versi. Edit `.env` hanya lewat perintah di atas / `nano` — jangan tampilkan
  isinya ke chat.

Kembali ke terbaru (hapus kunci rollback):

```bash
cd /var/www/online-survei
sed -i '/^IMAGE_TAG=/d' .env \
  && docker compose pull backend frontend \
  && docker compose up -d --no-build backend frontend
```

## Bila `latest` tertinggal atau terbelah

Jarang: job **Promosikan latest** gagal (mis. registry sedang bermasalah) atau
tampil `cancelled` (antrean promosi penuh, >100). Akibatnya `latest` tetap di
commit lebih lama — atau, bila gagal **di tengah** (log: `frontend:latest BELUM
(terbelah)`), backend:latest sudah di commit baru sedangkan frontend:latest
belum. Saat terbelah **jangan deploy**: `pull` menarik pasangan beda versi.

Perbaiki (aman diulang — promosi hanya memajukan `latest`, tidak pernah
memundurkannya, juga dari keadaan terbelah):

1. Buka run commit **terbaru** → **Re-run** job "Promosikan latest" (bisa s.d.
   30 hari setelah run), atau
2. Actions → CI → **Run workflow** (cabang `main`) — membangun ulang &
   mempromosikan HEAD main. Selalu bisa, juga bila CI commit terbaru gagal.

Bila Actions menampilkan **"Invalid workflow file"**, tak ada image yang terbit
— jangan deploy sampai workflow diperbaiki.

## Fallback bila registry tak terjangkau

Cara lama tetap bisa:

```bash
docker compose up -d --build backend frontend
```

## Catatan

- **Migrasi DB** tetap otomatis saat backend start (`migrationsRun` di produksi)
  — tidak ada langkah tambahan.
- Rollback image TIDAK me-rollback migrasi DB yang sudah jalan. Untuk rollback
  melewati commit yang membawa migrasi baru, cek dulu apakah migrasi tsb
  kompatibel-mundur (umumnya penambahan kolom/tabel aman). Bila tidak, skema DB
  harus ikut dikembalikan lewat restore — ikuti
  [backup-restore.md → Rollback melewati migrasi](backup-restore.md#rollback-melewati-migrasi-yang-tidak-kompatibel);
  jangan hanya mengganti `IMAGE_TAG`. **Data (DB + berkas MinIO) yang masuk
  sejak backup itu HILANG** — jalankan `./scripts/backup.sh` dulu. Tarik image
  lama **sebelum** restore (`IMAGE_TAG=sha-<SHA> docker compose pull backend
frontend`; gagal → jangan restore). Setelah restore, nyalakan backend dengan
  `IMAGE_TAG=sha-<SHA> docker compose up -d --no-build backend frontend` —
  **jangan** `docker compose start backend`: container itu masih memakai image
  baru dan akan menjalankan ulang migrasinya.
- `.env` / `backend/.env` tidak tersentuh alur ini (kecuali baris `IMAGE_TAG`
  saat rollback) — tetap dibaca saat `up`.
