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

# Backup berisi SELURUH data responden (PII) — file & folder baru hanya bisa
# dibaca pemiliknya (600/700), apa pun umask shell/cron pemanggil.
umask 077

BACKUP_DIR="${BACKUP_DIR:-/var/backups/survei}"
# Image utilitas untuk tar/untar volume MinIO. Dipin ke tag PERSIS (T-37):
# container ini membaca SELURUH media responden, jadi jangan ikut `alpine`
# mutable. Naikkan versi dengan sengaja (cek changelog), bukan otomatis.
ALPINE_IMAGE="${ALPINE_IMAGE:-alpine:3.24.4}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
PG_CONTAINER="${PG_CONTAINER:-survei_postgres}"
MINIO_CONTAINER="${MINIO_CONTAINER:-survei_minio}"
TS="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"
echo "[$(date '+%F %T')] Mulai backup → $BACKUP_DIR"

PG_FILE="$BACKUP_DIR/db-$TS.dump"
MINIO_FILE="$BACKUP_DIR/minio-$TS.tar.gz"
# Tulis ke *.partial, uji terbaca UTUH, baru rename: backup yang gagal/terputus
# di tengah tak pernah muncul sebagai db-*.dump / minio-*.tar.gz (yang dipilih
# restore.sh <TS>/--latest).
trap 'rm -f "$PG_FILE.partial" "$MINIO_FILE.partial"' EXIT
# Tanpa trap ini Ctrl-C TIDAK menghentikan skrip: klien `docker exec` keluar
# dengan status 0 saat menerima SIGINT, sehingga dump terpotong ikut di-rename.
# `exit` memicu trap EXIT di atas (buang *.partial).
trap 'echo "Backup DIBATALKAN (sinyal) — tidak ada backup baru." >&2; exit 130' INT TERM HUP

# --- PostgreSQL: dump format custom (terkompresi, cocok utk pg_restore) -------
docker exec "$PG_CONTAINER" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -F c' > "$PG_FILE.partial"
# Baca SELURUH isi (pg_restore -l hanya membaca daftar isi; potongan pun lolos).
docker exec -i "$PG_CONTAINER" pg_restore -f /dev/null < "$PG_FILE.partial"
mv "$PG_FILE.partial" "$PG_FILE"
echo "[$(date '+%F %T')] DB    → $PG_FILE ($(du -h "$PG_FILE" | cut -f1))"

# --- MinIO: stream tar seluruh /data via stdout (semua bucket: uploads/exports)
# Streaming (bukan bind-mount) → portabel & bisa diuji di mesin mana pun.
docker run --rm --volumes-from "$MINIO_CONTAINER" "$ALPINE_IMAGE" \
  tar czf - -C /data . > "$MINIO_FILE.partial"
docker run --rm -i "$ALPINE_IMAGE" sh -c 'tar tzf - >/dev/null' < "$MINIO_FILE.partial"
mv "$MINIO_FILE.partial" "$MINIO_FILE"
echo "[$(date '+%F %T')] MinIO → $MINIO_FILE ($(du -h "$MINIO_FILE" | cut -f1))"

# --- Retensi: buang backup lama -----------------------------------------------
find "$BACKUP_DIR" -maxdepth 1 -name 'db-*.dump'      -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -maxdepth 1 -name 'minio-*.tar.gz' -mtime +"$RETENTION_DAYS" -delete
# Dump pengaman yang dibuat restore.sh sebelum menimpa DB.
find "$BACKUP_DIR" -maxdepth 1 -name 'prerestore-db-*.dump' -mtime +"$RETENTION_DAYS" -delete
# Sisa *.partial dari proses yang mati paksa (SIGKILL/OOM/reboot) — trap tak
# sempat jalan. Lebih dari sehari pasti bukan backup yang sedang berjalan.
find "$BACKUP_DIR" -maxdepth 1 -name '*.partial' -mtime +1 -delete

echo "[$(date '+%F %T')] Selesai. Retensi ${RETENTION_DAYS} hari."

# PENTING: salin backup ke lokasi LAIN (offsite) agar aman bila VPS hilang.
# Sebaiknya TERENKRIPSI bila tujuannya pihak ketiga — lihat
# docs/ops/backup-restore.md bagian Offsite. Contoh (aktifkan & sesuaikan):
#   rsync -az "$BACKUP_DIR/" user@host-cadangan:/backup/survei/
#   # atau unggah ke object storage lain (rclone/aws s3 cp).
