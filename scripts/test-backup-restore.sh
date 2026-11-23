#!/usr/bin/env bash
#
# Uji ROUNDTRIP backup → "migrasi baru" → restore → verifikasi, memakai
# scripts/backup.sh & scripts/restore.sh yang SESUNGGUHNYA terhadap container
# ephemeral. Yang dibuktikan:
#   - backup benar-benar bisa dipulihkan: isi DB (pg_dump) & isi volume MinIO
#     sesudah restore IDENTIK dengan saat backup;
#   - restore membuang semua yang TIDAK ada di backup: tabel/enum/sequence/kolom/
#     baris dari migrasi setelah backup; bucket baru & metadata di .minio.sys;
#   - ekstensi uuid-ossp & pgcrypto kembali dan berfungsi (default kolom);
#   - restore ATOMIK: dump terpotong / arsip MinIO terpotong / error SQL di
#     akhir dump utuh → exit ≠ 0 dan DB maupun MinIO tidak berubah sedikit pun;
#   - --latest menolak db-<TS>.dump tanpa pasangan minio-<TS>.tar.gz;
#   - dump pengaman prerestore-db-*.dump dibuat, diabaikan --latest, dan bisa
#     dipakai membatalkan restore.
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
RESTORE="$ROOT/scripts/restore.sh"
LOG="$BACKUP_DIR/restore.log"

# Langkah 6 menghentikan container MinIO (prosedur yang didokumentasikan);
# apa pun hasilnya, nyalakan lagi agar uji bisa diulang.
trap 'docker start "$MINIO_CONTAINER" >/dev/null 2>&1 || true; rm -rf "$BACKUP_DIR"' EXIT

MARKER="RESTORE_OK_$$"
fail() { echo "❌ GAGAL: $*" >&2; exit 1; }
# SQL tanpa output / query satu nilai di DB uji.
sql() {
  docker exec "$PG_CONTAINER" psql -X -q -v ON_ERROR_STOP=1 -U test -d survei_test \
    -c 'SET client_min_messages = warning' -c "$1" >/dev/null
}
q() { docker exec "$PG_CONTAINER" psql -X -q -tA -v ON_ERROR_STOP=1 -U test -d survei_test -c "$1"; }
ALPINE_IMAGE="${ALPINE_IMAGE:-alpine:3.24.4}"
minio() { docker run --rm --volumes-from "$MINIO_CONTAINER" "$ALPINE_IMAGE" sh -c "$1"; }
# Isi DB lengkap (skema + data) sebagai hash; baris \restrict (kunci acak, PG ≥16.10) dibuang.
db_content() {
  docker exec "$PG_CONTAINER" pg_dump -U test -d survei_test --no-owner \
    | grep -Ev '^\\(un)?restrict ' | md5sum | cut -d' ' -f1
}
# Keadaan DB termasuk OID (skema public & tabel): berubah bila ada DROP/CREATE
# yang ter-commit — untuk membuktikan restore gagal benar-benar tak menyentuh DB.
db_state() {
  q "SELECT concat_ws('|', (SELECT oid FROM pg_namespace WHERE nspname = 'public'),
       to_regclass('public.backup_probe')::oid, to_regclass('public.mig_new')::oid,
       to_regtype('public.mig_status')::oid, to_regclass('public.mig_seq')::oid,
       (SELECT count(*) FROM pg_class WHERE relnamespace = 'public'::regnamespace))"
  db_content
}
# Isi volume MinIO (semua path termasuk ber-titik + isi file) sebagai hash.
minio_state() { minio 'cd /data && { find . | sort; find . -type f -exec md5sum {} + | sort; } | md5sum | cut -d" " -f1'; }
n_safety() { find "$BACKUP_DIR" -maxdepth 1 -name 'prerestore-db-*.dump' | wc -l | tr -d ' '; }

echo "▶ 1. Seed: tabel ber-ekstensi (uuid-ossp, pgcrypto) + objek MinIO (termasuk .minio.sys)…"
# Data pengisi → bagian DATA arsip jauh lebih besar dari TOC, sehingga potongan
# 50% di langkah 4 jatuh di tengah data (kasus terburuk restore non-atomik).
sql "DROP TABLE IF EXISTS mig_new, backup_probe, backup_filler, grant_probe CASCADE;
     DROP SEQUENCE IF EXISTS mig_seq; DROP TYPE IF EXISTS mig_status;
     CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"; CREATE EXTENSION IF NOT EXISTS pgcrypto;
     CREATE TABLE backup_probe(
       id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
       salt text NOT NULL DEFAULT encode(gen_random_bytes(8), 'hex'),
       n int UNIQUE NOT NULL, note text);
     INSERT INTO backup_probe(n, note) VALUES (42, '$MARKER');
     CREATE TABLE backup_filler AS SELECT g AS id, md5(g::text) AS h FROM generate_series(1, 20000) g;"
minio "mkdir -p /data/probe-bucket /data/.minio.sys/buckets/probe-bucket &&
       printf '%s' '$MARKER' > /data/probe-bucket/marker.txt &&
       printf '%s' '$MARKER' > /data/.minio.sys/buckets/probe-bucket/.metadata.bin"
DB_AT_BACKUP="$(db_content)"
MINIO_AT_BACKUP="$(minio_state)"

echo "▶ 2. Backup (scripts/backup.sh)…"
bash "$ROOT/scripts/backup.sh" >/dev/null
# ls -t: nama file buatan skrip (angka/strip) & butuh urut mtime.
# shellcheck disable=SC2012
TS="$(ls -1t "$BACKUP_DIR"/db-*.dump | head -1 | sed -E 's/.*db-(.*)\.dump/\1/')"
[ -n "$TS" ] || fail "backup tidak menghasilkan file dump."
if ls "$BACKUP_DIR"/*.partial >/dev/null 2>&1; then fail "backup.sh meninggalkan *.partial."; fi
echo "   timestamp: $TS"
DUMP="$BACKUP_DIR/db-$TS.dump"
ARCHIVE="$BACKUP_DIR/minio-$TS.tar.gz"

echo "▶ 3. Simulasi migrasi BARU setelah backup (tabel+enum+sequence+kolom+baris; bucket & .minio.sys baru)…"
sql "CREATE TYPE mig_status AS ENUM ('draft', 'final');
     CREATE SEQUENCE mig_seq;
     CREATE TABLE mig_new(id int PRIMARY KEY DEFAULT nextval('mig_seq'),
       status mig_status NOT NULL DEFAULT 'draft');
     INSERT INTO mig_new DEFAULT VALUES;
     ALTER TABLE backup_probe ADD COLUMN mig_col text DEFAULT 'baru';
     INSERT INTO backup_probe(n, note) VALUES (99, 'setelah-backup');
     UPDATE backup_probe SET note = 'DIUBAH' WHERE n = 42;"
minio "mkdir -p /data/new-bucket /data/.minio.sys/buckets/new-bucket &&
       echo baru > /data/new-bucket/obj.txt &&
       echo basi > /data/.minio.sys/buckets/new-bucket/.metadata.bin &&
       echo basi > /data/.sisa-dotfile &&
       echo DIUBAH > /data/probe-bucket/marker.txt"
DB_MIGRATED="$(db_state)"
DB_MIGRATED_CONTENT="$(db_content)"
MINIO_MIGRATED="$(minio_state)"

echo "▶ 4. Restore dari dump TERPOTONG harus gagal tanpa mengubah DB…"
mkdir -p "$BACKUP_DIR/rusak"
SZ="$(wc -c < "$DUMP" | tr -d ' ')"
for cut in $((SZ / 2)) $((SZ - 1)); do
  head -c "$cut" "$DUMP" > "$BACKUP_DIR/rusak/db-terpotong.dump"
  if bash "$RESTORE" --yes --db-only --db "$BACKUP_DIR/rusak/db-terpotong.dump" >"$LOG" 2>&1; then
    cat "$LOG" >&2
    fail "restore dump terpotong ($cut/$SZ bita) malah exit 0."
  fi
  if [ "$(db_state)" != "$DB_MIGRATED" ]; then
    cat "$LOG" >&2
    fail "DB BERUBAH setelah restore gagal ($cut/$SZ bita) — restore tidak atomik."
  fi
done

echo "▶ 5. Arsip MinIO TERPOTONG harus menggagalkan restore sebelum DB/MinIO disentuh…"
MSZ="$(wc -c < "$ARCHIVE" | tr -d ' ')"
head -c $((MSZ / 2)) "$ARCHIVE" > "$BACKUP_DIR/rusak/minio-terpotong.tar.gz"
if bash "$RESTORE" --yes --db "$DUMP" --minio "$BACKUP_DIR/rusak/minio-terpotong.tar.gz" >"$LOG" 2>&1; then
  cat "$LOG" >&2
  fail "restore dengan arsip MinIO terpotong malah exit 0."
fi
[ "$(db_state)" = "$DB_MIGRATED" ] || fail "DB berubah padahal arsip MinIO rusak."
[ "$(minio_state)" = "$MINIO_MIGRATED" ] || fail "MinIO berubah padahal arsipnya rusak."

echo "▶ 5b. Dump UTUH yang gagal saat dieksekusi (GRANT ke role yang sudah hilang) → ROLLBACK total…"
# Dump terpotong (langkah 4) sudah ditolak sebelum psql jalan; langkah ini
# menjaga fase SQL: tanpa --single-transaction / ON_ERROR_STOP, DROP SCHEMA dkk.
# ter-commit sebelum error di GRANT (bagian ACL ada di akhir SQL).
ROLE="rv_hilang_$$"
sql "DROP ROLE IF EXISTS $ROLE; CREATE ROLE $ROLE;
     CREATE TABLE grant_probe(id int); GRANT SELECT ON grant_probe TO $ROLE;"
docker exec "$PG_CONTAINER" pg_dump -U test -d survei_test -F c > "$BACKUP_DIR/rusak/db-grant.dump"
sql "DROP TABLE grant_probe; DROP ROLE $ROLE;"
[ "$(db_state)" = "$DB_MIGRATED" ] || fail "persiapan langkah 5b mengubah DB."
if bash "$RESTORE" --yes --db-only --no-safety-dump --db "$BACKUP_DIR/rusak/db-grant.dump" >"$LOG" 2>&1; then
  cat "$LOG" >&2
  fail "restore dump ber-GRANT ke role yang hilang malah exit 0."
fi
grep -q 'DB TIDAK berubah' "$LOG" || { cat "$LOG" >&2; fail "pesan gagal tidak melaporkan 'DB TIDAK berubah'."; }
[ "$(db_state)" = "$DB_MIGRATED" ] || fail "DB BERUBAH setelah error di fase SQL — transaksi tidak atomik."

echo "▶ 6. Restore sungguhan (MinIO dihentikan dulu, scripts/restore.sh <TS>)…"
SAFETY_BEFORE="$(n_safety)"
docker stop "$MINIO_CONTAINER" >/dev/null
bash "$RESTORE" --yes "$TS" >/dev/null

echo "▶ 7. Verifikasi: sisa migrasi hilang, data & ekstensi kembali, MinIO identik…"
[ -z "$(q "SELECT to_regclass('public.mig_new')")" ] || fail "tabel migrasi baru (mig_new) masih ada."
[ -z "$(q "SELECT to_regtype('public.mig_status')")" ] || fail "tipe enum migrasi baru (mig_status) masih ada."
[ -z "$(q "SELECT to_regclass('public.mig_seq')")" ] || fail "sequence migrasi baru (mig_seq) masih ada."
COLS="$(q "SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public'
          AND table_name = 'backup_probe' AND column_name = 'mig_col'")"
[ "$COLS" = 0 ] || fail "kolom tambahan backup_probe.mig_col masih ada."
ROWS="$(q "SELECT string_agg(n || ':' || note, ',' ORDER BY n) FROM backup_probe")"
[ "$ROWS" = "42:$MARKER" ] || fail "DB: baris='$ROWS' (harusnya '42:$MARKER')."
[ "$(db_content)" = "$DB_AT_BACKUP" ] || fail "isi DB (pg_dump) tidak identik dengan saat backup."
EXT="$(q "SELECT string_agg(extname || '@' || extnamespace::regnamespace, ',' ORDER BY extname) FROM pg_extension")"
[ "$EXT" = "pgcrypto@public,plpgsql@pg_catalog,uuid-ossp@public" ] || fail "ekstensi: '$EXT'."
DEF="$(docker exec "$PG_CONTAINER" psql -X -q -tA -v ON_ERROR_STOP=1 -U test -d survei_test \
  -c 'BEGIN' \
  -c "INSERT INTO backup_probe(n, note) VALUES (7, 'ekstensi') RETURNING id IS NOT NULL AND length(salt) = 16" \
  -c 'ROLLBACK')"
[ "$DEF" = t ] || fail "default kolom berbasis ekstensi tidak jalan ('$DEF')."
NSP="$(q "SELECT pg_get_userbyid(nspowner) || ' ' || array_to_string(nspacl, ',') || ' '
          || coalesce(obj_description(oid, 'pg_namespace'), '') FROM pg_namespace WHERE nspname = 'public'")"
[ "$NSP" = "pg_database_owner pg_database_owner=UC/pg_database_owner,=U/pg_database_owner standard public schema" ] \
  || fail "skema public tidak seperti bawaan: '$NSP'."
minio 'test ! -e /data/new-bucket && test ! -e /data/.minio.sys/buckets/new-bucket && test ! -e /data/.sisa-dotfile' \
  || fail "MinIO: bucket / metadata .minio.sys / dotfile baru masih ada."
OBJ="$(minio 'cat /data/probe-bucket/marker.txt')"
[ "$OBJ" = "$MARKER" ] || fail "MinIO: objek='$OBJ' (harusnya '$MARKER')."
META="$(minio 'cat /data/.minio.sys/buckets/probe-bucket/.metadata.bin')"
[ "$META" = "$MARKER" ] || fail "MinIO: .minio.sys='$META' (harusnya '$MARKER')."
[ "$(minio_state)" = "$MINIO_AT_BACKUP" ] || fail "isi volume MinIO tidak identik dengan saat backup."

echo "▶ 8. Dump pengaman prerestore-db-*.dump memuat keadaan sebelum restore…"
[ "$(n_safety)" -eq $((SAFETY_BEFORE + 1)) ] || fail "restore tidak membuat tepat satu dump pengaman baru."
# shellcheck disable=SC2012
SAFETY="$(ls -1t "$BACKUP_DIR"/prerestore-db-*.dump | head -1)"
TOC="$(docker exec -i "$PG_CONTAINER" pg_restore -l < "$SAFETY")"
grep -q ' TABLE public mig_new ' <<<"$TOC" || fail "dump pengaman tidak memuat tabel mig_new."

echo "▶ 9. --latest: tolak db tanpa pasangan minio; abaikan dump pengaman; --no-safety-dump; idempoten…"
# Backup yang gagal di langkah MinIO hanya meninggalkan db-<TS>.dump: --latest
# tidak boleh diam-diam memasangkannya dengan minio-*.tar.gz yang lebih lama.
cp "$DUMP" "$BACKUP_DIR/db-99991231-235959.dump"
if bash "$RESTORE" --yes --latest --no-safety-dump >"$LOG" 2>&1; then
  cat "$LOG" >&2
  fail "--latest memasangkan db tanpa pasangan minio dengan arsip lain."
fi
grep -q 'tak punya pasangan' "$LOG" || { cat "$LOG" >&2; fail "--latest gagal dengan alasan lain."; }
rm -f "$BACKUP_DIR/db-99991231-235959.dump"
[ "$(db_content)" = "$DB_AT_BACKUP" ] || fail "--latest yang ditolak mengubah DB."
N="$(n_safety)"
OUT="$(bash "$RESTORE" --yes --latest --no-safety-dump 2>&1)"
grep -q "db-$TS.dump" <<<"$OUT" || fail "--latest tidak memilih db-$TS.dump: $OUT"
if grep -q 'DB .*prerestore-db-' <<<"$OUT"; then fail "--latest memilih dump pengaman: $OUT"; fi
[ "$(n_safety)" = "$N" ] || fail "--no-safety-dump tetap membuat dump pengaman."
[ "$(db_content)" = "$DB_AT_BACKUP" ] || fail "restore ulang: isi DB tidak identik dengan backup."
[ "$(minio_state)" = "$MINIO_AT_BACKUP" ] || fail "restore ulang: isi MinIO tidak identik dengan backup."

echo "▶ 10. Batalkan restore memakai dump pengaman (--db-only --db prerestore-db-*.dump)…"
bash "$RESTORE" --yes --db-only --db "$SAFETY" >/dev/null
[ "$(q 'SELECT count(*) FROM mig_new')" = 1 ] || fail "batal-restore: mig_new tidak kembali."
[ "$(db_content)" = "$DB_MIGRATED_CONTENT" ] || fail "batal-restore: isi DB tidak sama dengan sebelum restore."

echo "✅ LULUS: restore atomik, membuang objek yang tak ada di backup, DB & MinIO identik dengan backup."
