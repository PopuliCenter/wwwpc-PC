#!/usr/bin/env bash
#
# Uji ROUNDTRIP backup → wipe → restore → verifikasi, memakai scripts/backup.sh
# & scripts/restore.sh yang SESUNGGUHNYA terhadap container ephemeral. Membuktikan
# backup benar-benar bisa dipulihkan (bukan sekadar terbentuk).
#
#   docker compose -f docker-compose.backup-test.yml up -d   # sebelum menjalankan
#   bash scripts/test-backup-restore.sh
#
set -euo pipefail

# Windows/Git Bash: cegah konversi otomatis path Unix (mis. `/data`) jadi path
# Windows saat diteruskan ke docker. No-op di Linux (VPS). Diwariskan ke
# backup.sh/restore.sh yang dipanggil dari sini.
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# Fungsi pembungkus agar path repo yang mengandung spasi tetap aman.
compose() { docker compose -f docker-compose.backup-test.yml "$@"; }
BACKUP_DIR="$(mktemp -d 2>/dev/null || echo "${TMPDIR:-/tmp}/backup-test-$$")"
mkdir -p "$BACKUP_DIR"

PG_CONTAINER="$(compose ps -q postgres)"
MINIO_CONTAINER="$(compose ps -q minio)"
[ -n "$PG_CONTAINER" ] || { echo "Postgres test belum jalan. Jalankan: compose up -d" >&2; exit 1; }
[ -n "$MINIO_CONTAINER" ] || { echo "MinIO test belum jalan." >&2; exit 1; }

export PG_CONTAINER MINIO_CONTAINER BACKUP_DIR

MARKER="RESTORE_OK_$$"
fail() { echo "❌ GAGAL: $*" >&2; exit 1; }

echo "▶ 1. Seed data uji (DB row + objek MinIO)…"
docker exec "$PG_CONTAINER" psql -U test -d survei_test -q -c \
  "DROP TABLE IF EXISTS backup_probe; CREATE TABLE backup_probe(id int, note text); INSERT INTO backup_probe VALUES (42, '$MARKER');"
docker run --rm --volumes-from "$MINIO_CONTAINER" alpine \
  sh -c "mkdir -p /data/probe-bucket && printf '%s' '$MARKER' > /data/probe-bucket/marker.txt"

echo "▶ 2. Backup (scripts/backup.sh)…"
bash "$ROOT/scripts/backup.sh" >/dev/null
TS="$(ls -1t "$BACKUP_DIR"/db-*.dump | head -1 | sed -E 's/.*db-(.*)\.dump/\1/')"
[ -n "$TS" ] || fail "backup tidak menghasilkan file dump."
echo "   timestamp: $TS"

echo "▶ 3. Wipe (hapus tabel + kosongkan MinIO)…"
docker exec "$PG_CONTAINER" psql -U test -d survei_test -q -c "DROP TABLE backup_probe;"
docker run --rm --volumes-from "$MINIO_CONTAINER" alpine sh -c 'rm -rf /data/*'
# Pastikan benar-benar hilang sebelum restore.
if docker exec "$PG_CONTAINER" psql -U test -d survei_test -tAc \
    "SELECT to_regclass('backup_probe');" | grep -q backup_probe; then
  fail "tabel masih ada setelah wipe."
fi

echo "▶ 4. Restore (scripts/restore.sh)…"
bash "$ROOT/scripts/restore.sh" --yes "$TS" >/dev/null

echo "▶ 5. Verifikasi data kembali…"
ROW="$(docker exec "$PG_CONTAINER" psql -U test -d survei_test -tAc \
  "SELECT note FROM backup_probe WHERE id = 42;" | tr -d '[:space:]')"
[ "$ROW" = "$MARKER" ] || fail "DB: note='$ROW' (harusnya '$MARKER')."

OBJ="$(docker run --rm --volumes-from "$MINIO_CONTAINER" alpine cat /data/probe-bucket/marker.txt)"
[ "$OBJ" = "$MARKER" ] || fail "MinIO: objek='$OBJ' (harusnya '$MARKER')."

rm -rf "$BACKUP_DIR"
echo "✅ LULUS: DB & MinIO berhasil dipulihkan dari backup (roundtrip)."
