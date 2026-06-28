#!/usr/bin/env bash
#
# Backup harian PostgreSQL + MinIO untuk Survei Populi.
# Jalankan di VPS. Pasang otomatis via cron — lihat docs/ops/backup-restore.md.
#
# Konfigurasi (opsional, via env):
#   BACKUP_DIR     direktori tujuan backup (default /var/backups/survei)
#   RETENTION_DAYS hapus backup lebih lama dari N hari (default 14)
#
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/survei}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
PG_CONTAINER="${PG_CONTAINER:-survei_postgres}"
MINIO_CONTAINER="${MINIO_CONTAINER:-survei_minio}"
TS="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"
echo "[$(date '+%F %T')] Mulai backup → $BACKUP_DIR"

# --- PostgreSQL: dump format custom (terkompresi, cocok utk pg_restore) -------
PG_FILE="$BACKUP_DIR/db-$TS.dump"
docker exec "$PG_CONTAINER" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -F c' > "$PG_FILE"
echo "[$(date '+%F %T')] DB    → $PG_FILE ($(du -h "$PG_FILE" | cut -f1))"

# --- MinIO: tar seluruh /data (mencakup semua bucket: uploads & exports) ------
MINIO_FILE="$BACKUP_DIR/minio-$TS.tar.gz"
docker run --rm --volumes-from "$MINIO_CONTAINER" -v "$BACKUP_DIR":/backup alpine \
  tar czf "/backup/minio-$TS.tar.gz" -C /data .
echo "[$(date '+%F %T')] MinIO → $MINIO_FILE ($(du -h "$MINIO_FILE" | cut -f1))"

# --- Retensi: buang backup lama -----------------------------------------------
find "$BACKUP_DIR" -maxdepth 1 -name 'db-*.dump'      -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -maxdepth 1 -name 'minio-*.tar.gz' -mtime +"$RETENTION_DAYS" -delete

echo "[$(date '+%F %T')] Selesai. Retensi ${RETENTION_DAYS} hari."

# PENTING: salin backup ke lokasi LAIN (offsite) agar aman bila VPS hilang.
# Contoh (aktifkan & sesuaikan):
#   rsync -az "$BACKUP_DIR/" user@host-cadangan:/backup/survei/
#   # atau unggah ke object storage lain (rclone/aws s3 cp).
