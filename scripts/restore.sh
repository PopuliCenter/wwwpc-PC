#!/usr/bin/env bash
#
# Restore PostgreSQL + MinIO Survei Populi dari backup (dibuat scripts/backup.sh).
# Menimpa data yang ada — pastikan benar. Jalankan di VPS.
#
# Pemakaian:
#   scripts/restore.sh <TIMESTAMP>       # pulihkan db-<TS>.dump + minio-<TS>.tar.gz
#   scripts/restore.sh --db <file> --minio <file>
#   scripts/restore.sh --latest          # backup terbaru di BACKUP_DIR
# Opsi:
#   -y | --yes    lewati konfirmasi (untuk otomasi/uji)
#   --db-only | --minio-only   pulihkan salah satu saja
#
# Konfigurasi (env, samakan dengan backup.sh):
#   BACKUP_DIR (default /var/backups/survei)
#   PG_CONTAINER (default survei_postgres), MINIO_CONTAINER (default survei_minio)
#
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/survei}"
PG_CONTAINER="${PG_CONTAINER:-survei_postgres}"
MINIO_CONTAINER="${MINIO_CONTAINER:-survei_minio}"

DB_FILE=""
MINIO_FILE=""
ASSUME_YES=0
DO_DB=1
DO_MINIO=1

die() {
  echo "Error: $*" >&2
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --db) DB_FILE="$2"; shift 2 ;;
    --minio) MINIO_FILE="$2"; shift 2 ;;
    --db-only) DO_MINIO=0; shift ;;
    --minio-only) DO_DB=0; shift ;;
    -y|--yes) ASSUME_YES=1; shift ;;
    --latest)
      DB_FILE="$(ls -1t "$BACKUP_DIR"/db-*.dump 2>/dev/null | head -1 || true)"
      MINIO_FILE="$(ls -1t "$BACKUP_DIR"/minio-*.tar.gz 2>/dev/null | head -1 || true)"
      shift ;;
    -*) die "opsi tak dikenal: $1" ;;
    *)
      # Argumen posisi = TIMESTAMP
      DB_FILE="$BACKUP_DIR/db-$1.dump"
      MINIO_FILE="$BACKUP_DIR/minio-$1.tar.gz"
      shift ;;
  esac
done

[ "$DO_DB" -eq 1 ] && [ -z "$DB_FILE" ] && die "file dump DB tidak ditentukan (beri <TIMESTAMP>, --db, atau --latest)."
[ "$DO_MINIO" -eq 1 ] && [ -z "$MINIO_FILE" ] && die "file arsip MinIO tidak ditentukan."
[ "$DO_DB" -eq 1 ] && [ ! -f "$DB_FILE" ] && die "tidak ada: $DB_FILE"
[ "$DO_MINIO" -eq 1 ] && [ ! -f "$MINIO_FILE" ] && die "tidak ada: $MINIO_FILE"

echo "Akan MENIMPA data dengan:"
[ "$DO_DB" -eq 1 ] && echo "  DB    ← $DB_FILE  (container: $PG_CONTAINER)"
[ "$DO_MINIO" -eq 1 ] && echo "  MinIO ← $MINIO_FILE  (container: $MINIO_CONTAINER)"

if [ "$ASSUME_YES" -ne 1 ]; then
  printf "Lanjutkan? ketik 'ya': "
  read -r ans
  [ "$ans" = "ya" ] || die "dibatalkan."
fi

# --- PostgreSQL: pg_restore custom-format via stdin (drop & buat ulang objek) --
if [ "$DO_DB" -eq 1 ]; then
  echo "[$(date '+%F %T')] Restore DB…"
  docker exec -i "$PG_CONTAINER" sh -c \
    'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' \
    < "$DB_FILE"
  echo "[$(date '+%F %T')] DB selesai."
fi

# --- MinIO: kosongkan /data lalu ekstrak tar via stdin (portabel, tanpa mount) -
if [ "$DO_MINIO" -eq 1 ]; then
  echo "[$(date '+%F %T')] Restore MinIO…"
  docker run --rm -i --volumes-from "$MINIO_CONTAINER" alpine \
    sh -c 'rm -rf /data/* && cd /data && tar xzf -' \
    < "$MINIO_FILE"
  echo "[$(date '+%F %T')] MinIO selesai."
fi

echo "[$(date '+%F %T')] Restore selesai. Pastikan timestamp DB & MinIO berdekatan."
