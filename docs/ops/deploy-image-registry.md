# Deploy via Image Registry (GHCR) — tanpa build di VPS

Sejak CI job **Publish image (GHCR)** aktif, setiap push ke `main` yang lolos
seluruh uji (lint, test, e2e, backup-roundtrip, audit) otomatis menerbitkan:

| Image                                  | Tag                       |
| -------------------------------------- | ------------------------- |
| `ghcr.io/populicenter/survei-backend`  | `latest` + `sha-<commit>` |
| `ghcr.io/populicenter/survei-frontend` | `latest` + `sha-<commit>` |

`docker-compose.yml` sudah menunjuk image ini (`IMAGE_TAG` default `latest`).
Blok `build:` tetap ada sebagai fallback.

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
docker compose pull backend frontend       # tarik image hasil CI
docker compose up -d backend frontend
```

Lebih cepat (VPS tak lagi mengompilasi), dan image yang jalan **persis** yang
sudah lolos CI.

> ⚠️ Tunggu CI hijau dulu (job "Publish image" selesai) sebelum `pull` — kalau
> tidak, yang tertarik masih image lama. Cek: GitHub → Actions → run terakhir.

## Rollback cepat ke commit sebelumnya

```bash
cd /var/www/online-survei
IMAGE_TAG=sha-<commit-sha-lama> docker compose up -d backend frontend
```

(`<commit-sha-lama>` = SHA penuh commit — lihat `git log` atau halaman Actions.)
Kembali ke terbaru: `docker compose up -d backend frontend` (IMAGE_TAG kosong →
`latest`).

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
  kompatibel-mundur (umumnya penambahan kolom/tabel aman).
- `.env` / `backend/.env` tidak tersentuh alur ini — tetap dibaca saat `up`.
