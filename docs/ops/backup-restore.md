# Backup & Restore — Survei Populi

Backup mencakup **dua** sumber data yang harus selalu sejalan:

- **PostgreSQL** — semua data relasional (pengguna, survei, jawaban, poin, audit).
- **MinIO** — berkas mentah (foto/audio/tanda tangan responden, file export).

Script: [`scripts/backup.sh`](../../scripts/backup.sh).

## Setup di VPS (sekali)

```bash
cd /var/www/online-survei
chmod +x scripts/backup.sh
mkdir -p /var/backups/survei

# Uji jalan manual dulu
./scripts/backup.sh
ls -lh /var/backups/survei
```

## Jadwalkan harian (cron)

```bash
crontab -e
```

Tambahkan (mis. tiap hari 02:30), arahkan ke folder repo:

```
30 2 * * * cd /var/www/online-survei && ./scripts/backup.sh >> /var/log/survei-backup.log 2>&1
```

## ⚠️ Offsite (sangat disarankan)

Backup di VPS yang sama TIDAK melindungi dari VPS hilang/terhapus. Salin ke
tempat lain — buka komentar di akhir `backup.sh`, contoh:

```
rsync -az /var/backups/survei/ user@host-cadangan:/backup/survei/
# atau: rclone copy /var/backups/survei remote:survei-backup
```

## Verifikasi backup (lakукан berkala!)

Backup yang tak pernah diuji = belum tentu bisa dipulihkan. Ada uji ROUNDTRIP
otomatis (backup → wipe → restore → cek data kembali) memakai script yang
sesungguhnya terhadap container ephemeral:

```bash
docker compose -f docker-compose.backup-test.yml up -d
bash scripts/test-backup-restore.sh      # → "LULUS" bila restore benar
docker compose -f docker-compose.backup-test.yml down -v
```

Uji ini juga berjalan otomatis di CI (job `backup-restore`). Tetap disarankan
sesekali menguji restore backup PRODUKSI ke environment uji.

---

# Restore

> Hentikan trafik dulu bila memungkinkan. Restore menimpa data — pastikan benar.

## Cara cepat (disarankan): `scripts/restore.sh`

```bash
cd /var/www/online-survei
docker compose stop backend          # hentikan tulis saat restore DB

./scripts/restore.sh <TIMESTAMP>     # pulihkan db-<TS>.dump + minio-<TS>.tar.gz
#   ./scripts/restore.sh --latest        # backup terbaru
#   ./scripts/restore.sh --db-only <TS>  # atau --minio-only <TS>
#   tambah -y untuk lewati konfirmasi

docker compose start backend
```

Script memakai streaming (tanpa bind-mount): `pg_restore --clean --if-exists`
untuk DB, ekstrak tar ke volume MinIO. Timestamp DB & MinIO dipasangkan otomatis.

## Manual (rujukan / bila perlu granular)

PostgreSQL:

```bash
docker exec -i survei_postgres sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' \
  < /var/backups/survei/db-<TIMESTAMP>.dump
```

MinIO (streaming, tanpa bind-mount):

```bash
docker run --rm -i --volumes-from survei_minio alpine \
  sh -c 'rm -rf /data/* && cd /data && tar xzf -' \
  < /var/backups/survei/minio-<TIMESTAMP>.tar.gz
```

## Catatan

- Selalu pilih **db** dan **minio** dari **timestamp yang berdekatan** agar
  rujukan berkas pada jawaban survei tetap cocok.
- Simpan kredensial (`DB_PASSWORD`, `MINIO_ROOT_PASSWORD`, `JWT_SECRET`, dll)
  di tempat aman — backup data saja tak cukup tanpa secrets untuk menjalankan app.
