#!/usr/bin/env bash
#
# Restore PostgreSQL + MinIO Survei Populi dari backup (dibuat scripts/backup.sh).
# Menimpa data yang ada — pastikan benar. Jalankan di VPS, sebaiknya di dalam
# tmux/screen. Hentikan backend (dan MinIO) dulu — lihat docs/ops/backup-restore.md.
#
# Semantik:
#   - DB: skema `public` DIGANTI UTUH dalam SATU transaksi. Objek yang tidak ada
#     di backup (tabel/enum/sequence/kolom dari migrasi yang lebih baru) ikut
#     hilang. Dump rusak/terpotong atau error SQL di titik mana pun → DB tidak
#     berubah sama sekali.
#   - Sebelum DB ditimpa, keadaan saat ini disimpan (dan diuji terbaca utuh) ke
#     $BACKUP_DIR/prerestore-db-<TS>.dump (dump pengaman, untuk membatalkan).
#   - MinIO: arsip diuji utuh dulu (sebelum DB maupun MinIO disentuh), lalu
#     SELURUH isi /data — termasuk .minio.sys — dihapus dan arsip diekstrak.
#   - Ctrl-C / SIGTERM / SIGHUP: skrip berhenti, langkah berikutnya TIDAK
#     dijalankan; restore DB yang sedang berjalan di container dihentikan
#     (→ ROLLBACK) dan hasil akhirnya dilaporkan.
#
# Pemakaian:
#   bash scripts/restore.sh <TIMESTAMP>    # db-<TS>.dump + minio-<TS>.tar.gz
#   bash scripts/restore.sh --db <file> --minio <file>
#   bash scripts/restore.sh --latest       # TS terbaru; db & minio dari TS yang SAMA
# Opsi:
#   -y | --yes          lewati konfirmasi (untuk otomasi/uji)
#   --db-only | --minio-only   pulihkan salah satu saja
#   --no-safety-dump    jangan buat dump pengaman sebelum menimpa DB
#
# Konfigurasi (env, samakan dengan backup.sh):
#   BACKUP_DIR (default /var/backups/survei)
#   PG_CONTAINER (default survei_postgres), MINIO_CONTAINER (default survei_minio)
#   PG_TMPDIR  folder DI DALAM container Postgres untuk SQL sementara (default
#              /tmp). Butuh ruang ≈ ukuran SQL tak terkompresi (beberapa kali
#              ukuran file .dump).
#
set -euo pipefail
# Dump pengaman berisi seluruh data responden — hanya bisa dibaca pemiliknya.
umask 077

BACKUP_DIR="${BACKUP_DIR:-/var/backups/survei}"
# Image utilitas untuk tar/untar volume MinIO. Dipin ke tag PERSIS (T-37):
# container ini membaca SELURUH media responden, jadi jangan ikut `alpine`
# mutable. Naikkan versi dengan sengaja (cek changelog), bukan otomatis.
ALPINE_IMAGE="${ALPINE_IMAGE:-alpine:3.24.4}"
PG_CONTAINER="${PG_CONTAINER:-survei_postgres}"
MINIO_CONTAINER="${MINIO_CONTAINER:-survei_minio}"
PG_TMPDIR="${PG_TMPDIR:-/tmp}"

DB_FILE=""
MINIO_FILE=""
ASSUME_YES=0
DO_DB=1
DO_MINIO=1
SAFETY_DUMP=1
LATEST=0

SAFETY_FILE=""  # dump pengaman (ditulis ke "$SAFETY_FILE.partial" dulu)
PG_TMP=""       # SQL sementara DI DALAM container Postgres, selama dipakai
PUBLIC_OID=""   # OID skema public sebelum restore DB (pembanding hasil akhir)
PHASE=awal      # awal | db | db-selesai | minio | selesai — untuk pesan pembatalan

die() {
  echo "Error: $*" >&2
  exit 1
}
log() { echo "[$(date '+%F %T')] $*"; }
warn() { echo "PERINGATAN: $*" >&2; }

# Jalankan satu query (argumen $1) sebagai POSTGRES_USER di container Postgres.
pg_query() {
  docker exec "$PG_CONTAINER" sh -c \
    'psql -X -tA -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1"' sh "$1"
}
public_oid() { pg_query "SELECT oid FROM pg_namespace WHERE nspname = 'public'"; }
# Ruang bebas sebuah path DI DALAM container Postgres (default: $PGDATA).
pg_free() {
  docker exec "$PG_CONTAINER" sh -c 'df -Ph "${1:-$PGDATA}" | awk "NR==2 {print \$4}"' sh "${1:-}" \
    2>/dev/null || echo '?'
}

# Hentikan restore DB yang mungkin masih berjalan DI container. Klien
# `docker exec` yang menerima Ctrl-C keluar sendiri (status 0) tetapi prosesnya
# di container tetap jalan: bunuh pg_restore/psql (argumennya memuat $PG_TMP)
# lalu putus sesinya (application_name survei-restore) → transaksi yang belum
# COMMIT di-ROLLBACK. Diulang agar proses yang baru mulai setelah sinyal ikut kena.
stop_db_restore() {
  local i found n
  for i in 1 2 3 4 5 6 7 8 9 10; do
    found=0
    if docker exec "$PG_CONTAINER" pkill -f "$PG_TMP" >/dev/null 2>&1; then found=1; fi
    n="$(pg_query "SELECT count(pg_terminate_backend(pid)) FROM pg_stat_activity
      WHERE application_name = 'survei-restore'" 2>/dev/null)" || n=0
    [ "$n" = 0 ] || found=1
    if [ "$found" -eq 0 ] && [ "$i" -ge 2 ]; then return 0; fi
    sleep 1
  done
}

# Hasil akhir DB setelah restore DB gagal/terputus. Transaksi restore men-DROP
# lalu membuat ulang skema public, jadi OID public berubah HANYA bila ter-COMMIT.
db_outcome() {
  local now
  if ! now="$(public_oid 2>/dev/null)"; then
    echo "status DB TIDAK bisa dipastikan (Postgres tak terjangkau) — periksa isinya sebelum menyalakan backend"
  elif [ "$now" = "$PUBLIC_OID" ]; then
    echo "DB TIDAK berubah (transaksi tidak dimulai atau di-ROLLBACK)"
  else
    echo "restore DB SUDAH ter-COMMIT utuh"
  fi
}

cleanup() {
  if [ -n "$SAFETY_FILE" ]; then rm -f "$SAFETY_FILE.partial"; fi
  if [ -n "$PG_TMP" ]; then docker exec "$PG_CONTAINER" rm -f "$PG_TMP" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT

# Tanpa trap ini, Ctrl-C TIDAK menghentikan skrip: bash melanjutkan ke langkah
# berikutnya karena klien `docker exec` keluar dengan status 0 (terbukti) —
# mis. dump pengaman terpotong dianggap OK, atau MinIO tetap ditimpa.
on_signal() {
  trap '' INT TERM HUP
  echo >&2
  case "$PHASE" in
    db)
      stop_db_restore
      echo "DIBATALKAN (sinyal) saat restore DB: $(db_outcome). MinIO tidak disentuh." >&2 ;;
    db-selesai)
      msg="DIBATALKAN (sinyal): DB SUDAH dipulihkan."
      [ "$DO_MINIO" -eq 1 ] && msg="$msg MinIO BELUM disentuh — lanjutkan dengan --minio-only."
      echo "$msg" >&2 ;;
    minio)
      echo "DIBATALKAN (sinyal) saat restore MinIO: /data mungkin setengah jadi — ulangi dengan --minio-only." >&2 ;;
    selesai)
      echo "DIBATALKAN (sinyal) setelah restore selesai." >&2 ;;
    *)
      echo "DIBATALKAN (sinyal): langkah berikutnya tidak dijalankan, data belum diubah." >&2 ;;
  esac
  exit 130
}
trap on_signal INT TERM HUP

while [ $# -gt 0 ]; do
  case "$1" in
    --db) DB_FILE="$2"; shift 2 ;;
    --minio) MINIO_FILE="$2"; shift 2 ;;
    --db-only) DO_MINIO=0; shift ;;
    --minio-only) DO_DB=0; shift ;;
    --no-safety-dump) SAFETY_DUMP=0; shift ;;
    -y|--yes) ASSUME_YES=1; shift ;;
    --latest) LATEST=1; shift ;;
    -*) die "opsi tak dikenal: $1" ;;
    *)
      # Argumen posisi = TIMESTAMP
      DB_FILE="$BACKUP_DIR/db-$1.dump"
      MINIO_FILE="$BACKUP_DIR/minio-$1.tar.gz"
      shift ;;
  esac
done

# TIMESTAMP terbesar dari nama $BACKUP_DIR/<awalan>-YYYYmmdd-HHMMSS<akhiran>
# (urut nama = urut waktu; tak bergantung mtime). Awalan `db-` sengaja tidak
# cocok dengan prerestore-db-*.dump.
latest_ts() {
  local f ts=""
  for f in "$BACKUP_DIR/$1"-[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9][0-9][0-9]"$2"; do
    [ -e "$f" ] || continue
    ts="${f#"$BACKUP_DIR/$1"-}"
    ts="${ts%"$2"}"
  done
  echo "$ts"
}

if [ "$LATEST" -eq 1 ]; then
  [ -z "$DB_FILE$MINIO_FILE" ] || die "--latest tidak bisa digabung dengan <TIMESTAMP>/--db/--minio."
  if [ "$DO_DB" -eq 1 ]; then
    TS="$(latest_ts db .dump)"
    [ -n "$TS" ] || die "tidak ada db-<TIMESTAMP>.dump di $BACKUP_DIR."
  else
    TS="$(latest_ts minio .tar.gz)"
    [ -n "$TS" ] || die "tidak ada minio-<TIMESTAMP>.tar.gz di $BACKUP_DIR."
  fi
  DB_FILE="$BACKUP_DIR/db-$TS.dump"
  MINIO_FILE="$BACKUP_DIR/minio-$TS.tar.gz"
  # DB & MinIO WAJIB dari backup yang sama: backup yang gagal di langkah MinIO
  # hanya meninggalkan db-<TS>.dump — jangan diam-diam dipasangkan dengan
  # minio-*.tar.gz yang lebih lama.
  if [ "$DO_DB" -eq 1 ] && [ "$DO_MINIO" -eq 1 ] && [ ! -f "$MINIO_FILE" ]; then
    die "backup terbaru db-$TS.dump tak punya pasangan minio-$TS.tar.gz (backup MinIO gagal?). Pilih <TIMESTAMP> eksplisit, atau --db-only --latest."
  fi
fi

[ "$DO_DB" -eq 1 ] && [ -z "$DB_FILE" ] && die "file dump DB tidak ditentukan (beri <TIMESTAMP>, --db, atau --latest)."
[ "$DO_MINIO" -eq 1 ] && [ -z "$MINIO_FILE" ] && die "file arsip MinIO tidak ditentukan."
[ "$DO_DB" -eq 1 ] && [ ! -f "$DB_FILE" ] && die "tidak ada: $DB_FILE"
[ "$DO_MINIO" -eq 1 ] && [ ! -f "$MINIO_FILE" ] && die "tidak ada: $MINIO_FILE"

# =============================================================================
# 1. PRA-PERIKSA (hanya membaca) — sebelum konfirmasi agar peringatan terbaca.
# =============================================================================
if [ "$DO_DB" -eq 1 ]; then
  public_oid >/dev/null || die "tidak bisa menghubungi Postgres di container $PG_CONTAINER."
  other_schemas="$(pg_query "SELECT coalesce(string_agg(nspname, ', ' ORDER BY nspname), '')
    FROM pg_namespace WHERE nspname NOT IN ('public', 'information_schema')
    AND nspname NOT LIKE 'pg\_%'")"
  if [ -n "$other_schemas" ]; then
    warn "ada skema selain public: $other_schemas. Restore hanya mengganti public:
  objek di skema itu yang BERGANTUNG pada public (view, default kolom yang memakai
  fungsi ekstensi, FK, dll.) IKUT TERHAPUS dan tidak dibuat ulang; bila dump juga
  memuat skema itu, restore gagal 'already exists' (DB tidak berubah).
  Survei hanya memakai public."
  fi
  conns="$(pg_query "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()
    AND pid <> pg_backend_pid() AND backend_type = 'client backend'")"
  if [ "$conns" != "0" ]; then
    warn "$conns koneksi lain ke DB (backend masih jalan?). Restore akan menunggu
  kunci tabel dan aplikasi yang jalan memakai skema lama. Disarankan:
  docker compose stop backend."
  fi
  bk_free="$(df -Ph "$BACKUP_DIR" 2>/dev/null | awk 'NR==2 {print $4}')" || bk_free='?'
  log "Ukuran DB sekarang: $(pg_query 'SELECT pg_size_pretty(pg_database_size(current_database()))').
  Ruang bebas — data Postgres: $(pg_free), SQL sementara ($PG_TMPDIR di container):
  $(pg_free "$PG_TMPDIR"), $BACKUP_DIR: ${bk_free:-?}. Butuh ≈ ukuran DB + SQL
  sementara (beberapa × .dump) + dump pengaman (≈ .dump) — lihat docs."
fi

if [ "$DO_MINIO" -eq 1 ]; then
  running="$(docker inspect -f '{{.State.Running}}' "$MINIO_CONTAINER" 2>/dev/null)" \
    || die "container MinIO tidak ditemukan: $MINIO_CONTAINER"
  if [ "$running" = "true" ]; then
    warn "container MinIO masih jalan — server men-cache metadata (.minio.sys)
  yang akan diganti. Disarankan: docker compose stop minio (restore tetap
  bisa saat container berhenti), lalu start lagi setelah restore."
  fi
  docker run --rm --volumes-from "$MINIO_CONTAINER" "$ALPINE_IMAGE" mountpoint -q /data \
    || die "/data di $MINIO_CONTAINER bukan volume — restore MinIO dibatalkan."
fi

echo "Akan MENIMPA data dengan:"
[ "$DO_DB" -eq 1 ] && echo "  DB    ← $DB_FILE  (container: $PG_CONTAINER; skema public diganti utuh)"
[ "$DO_MINIO" -eq 1 ] && echo "  MinIO ← $MINIO_FILE  (container: $MINIO_CONTAINER; seluruh /data diganti)"

if [ "$ASSUME_YES" -ne 1 ]; then
  printf "Lanjutkan? ketik 'ya': "
  read -r ans
  [ "$ans" = "ya" ] || die "dibatalkan."
fi

if [ "$DO_MINIO" -eq 1 ]; then
  # Uji arsip utuh (gzip CRC + struktur tar) SEBELUM DB maupun MinIO disentuh,
  # agar arsip MinIO rusak tidak berujung DB sudah diganti tapi MinIO gagal.
  log "Memeriksa keutuhan arsip MinIO…"
  docker run --rm -i "$ALPINE_IMAGE" sh -c 'tar tzf - >/dev/null' < "$MINIO_FILE" \
    || die "arsip MinIO rusak/terpotong: $MINIO_FILE — tidak ada data yang diubah."
fi

# =============================================================================
# 2. DUMP PENGAMAN — keadaan DB saat ini, untuk membatalkan restore.
#    Nama prerestore-db-*.dump sengaja tak cocok `db-*.dump` (--latest/<TS>).
# =============================================================================
if [ "$DO_DB" -eq 1 ] && [ "$SAFETY_DUMP" -eq 1 ]; then
  mkdir -p "$BACKUP_DIR"
  SAFETY_FILE="$BACKUP_DIR/prerestore-db-$(date +%Y%m%d-%H%M%S).dump"
  [ -e "$SAFETY_FILE" ] && SAFETY_FILE="${SAFETY_FILE%.dump}-$$.dump"
  log "Dump pengaman → $SAFETY_FILE"
  docker exec "$PG_CONTAINER" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -F c' \
    > "$SAFETY_FILE.partial" \
    || die "dump pengaman gagal — restore DIBATALKAN, data belum disentuh (lewati dengan --no-safety-dump bila yakin)."
  # Baca SELURUH isi sebelum diberi nama final (pg_restore -l saja tak cukup:
  # hanya membaca daftar isi, dump terpotong pun lolos).
  docker exec -i "$PG_CONTAINER" pg_restore -f /dev/null < "$SAFETY_FILE.partial" \
    || die "dump pengaman tidak terbaca utuh — restore DIBATALKAN, data belum disentuh."
  mv "$SAFETY_FILE.partial" "$SAFETY_FILE"
  log "Dump pengaman OK ($(du -h "$SAFETY_FILE" | cut -f1)). Batalkan restore dengan:"
  echo "  bash scripts/restore.sh --db-only --db $SAFETY_FILE"
fi

# =============================================================================
# 3. PostgreSQL — ganti skema public secara ATOMIK.
#    (a) arsip → file SQL sementara di container: dump rusak/terpotong (atau
#        ruang habis) gagal DI SINI, sebelum DB disentuh.
#    (b) psql --single-transaction: DROP/CREATE SCHEMA public + seluruh SQL
#        dalam satu transaksi; error apa pun → ROLLBACK.
#    Skema public dibuat ulang persis seperti bawaan PG15+ (pemilik
#    pg_database_owner, USAGE untuk PUBLIC, komentar standar). Dump tidak memuat
#    CREATE SCHEMA public; ekstensi (uuid-ossp, pgcrypto) ikut terhapus oleh
#    CASCADE lalu dibuat lagi oleh CREATE EXTENSION di dump.
#    (a) dan (b) dua `docker exec` terpisah: Ctrl-C saat (a) menghentikan skrip
#    sebelum (b) dimulai.
# =============================================================================
# shellcheck disable=SC2016  # $var di bawah sengaja diekspansi DI DALAM container
PG_PSQL_SH='psql -X -q -v ON_ERROR_STOP=1 --single-transaction -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "SET client_min_messages = warning" \
  -c "DROP SCHEMA IF EXISTS public CASCADE" \
  -c "CREATE SCHEMA public AUTHORIZATION pg_database_owner" \
  -c "GRANT USAGE ON SCHEMA public TO PUBLIC" \
  -c "COMMENT ON SCHEMA public IS '\''standard public schema'\''" \
  -f "$1" >/dev/null'

if [ "$DO_DB" -eq 1 ]; then
  PUBLIC_OID="$(public_oid)" || die "tidak bisa menghubungi Postgres di container $PG_CONTAINER."
  PG_TMP="$PG_TMPDIR/survei-restore-$(date +%Y%m%d%H%M%S)-$$.sql"
  PHASE=db
  log "Restore DB (a): arsip → SQL sementara…"
  docker exec -i "$PG_CONTAINER" pg_restore --no-owner -f "$PG_TMP" < "$DB_FILE" \
    || die "konversi arsip ke SQL gagal — arsip rusak/terpotong ATAU ruang $PG_TMPDIR di container habis (lihat pesan pg_restore di atas). DB TIDAK disentuh."
  log "  SQL sementara: $(docker exec "$PG_CONTAINER" du -h "$PG_TMP" | cut -f1) di $PG_TMP (sisa ruang: $(pg_free "$PG_TMPDIR"))"
  log "Restore DB (b): ganti skema public dalam satu transaksi…"
  if ! docker exec -e PGAPPNAME=survei-restore "$PG_CONTAINER" sh -c "$PG_PSQL_SH" sh "$PG_TMP"; then
    die "restore DB GAGAL — $(db_outcome); lihat pesan di atas. MinIO tidak disentuh."
  fi
  PHASE=db-selesai
  docker exec "$PG_CONTAINER" rm -f "$PG_TMP" || true
  PG_TMP=""
  log "DB selesai."
fi

# =============================================================================
# 4. MinIO — hapus SELURUH isi /data (termasuk entri ber-titik seperti
#    .minio.sys; `rm -rf /data/*` melewatkannya) lalu ekstrak tar via stdin.
# =============================================================================
if [ "$DO_MINIO" -eq 1 ]; then
  PHASE=minio
  log "Restore MinIO…"
  if ! docker run --rm -i --volumes-from "$MINIO_CONTAINER" "$ALPINE_IMAGE" \
      sh -c 'set -e; mountpoint -q /data; find /data -mindepth 1 -delete; cd /data; tar xzf -' \
      < "$MINIO_FILE"; then
    msg="restore MinIO GAGAL — isi /data mungkin setengah jadi; ulangi dengan --minio-only."
    [ "$DO_DB" -eq 1 ] && msg="$msg DB SUDAH dipulihkan."
    die "$msg"
  fi
  log "MinIO selesai."
fi

PHASE=selesai
log "Restore selesai."
