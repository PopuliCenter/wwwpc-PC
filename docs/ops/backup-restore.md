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
Backup yang tak pernah diuji = belum tentu bisa dipulihkan. Sebulan sekali,
coba restore ke environment uji.

---

# Restore

> Hentikan trafik dulu bila memungkinkan. Restore menimpa data — pastikan benar.

## 1) PostgreSQL
```bash
cd /var/www/online-survei
# Hentikan backend agar tak menulis saat restore
docker compose stop backend

# Restore dump custom-format (drop & buat ulang objek)
docker exec -i survei_postgres sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' \
  < /var/backups/survei/db-<TIMESTAMP>.dump

docker compose start backend
```
Bila perlu DB benar-benar bersih: drop & create database dulu, lalu pg_restore
tanpa `--clean`.

## 2) MinIO
```bash
cd /var/www/online-survei
docker compose stop minio
# Ekstrak isi tar ke dalam volume data MinIO
docker run --rm --volumes-from survei_minio \
  -v /var/backups/survei:/backup alpine \
  sh -c 'rm -rf /data/* && cd /data && tar xzf /backup/minio-<TIMESTAMP>.tar.gz'
docker compose start minio
```

## Catatan
- Selalu pilih **db** dan **minio** dari **timestamp yang berdekatan** agar
  rujukan berkas pada jawaban survei tetap cocok.
- Simpan kredensial (`DB_PASSWORD`, `MINIO_ROOT_PASSWORD`, `JWT_SECRET`, dll)
  di tempat aman — backup data saja tak cukup tanpa secrets untuk menjalankan app.
