# Backup & Restore — Survei Populi

Backup mencakup **dua** sumber data yang harus selalu sejalan:

- **PostgreSQL** — semua data relasional (pengguna, survei, jawaban, poin, audit).
- **MinIO** — berkas mentah (foto/audio/tanda tangan responden, file export).

Script: [`scripts/backup.sh`](../../scripts/backup.sh).

## Setup di VPS (sekali)

```bash
cd /var/www/online-survei
mkdir -p /var/backups/survei
chmod 700 /var/backups/survei        # backup = seluruh data responden (PII)

# Uji jalan manual dulu
bash scripts/backup.sh
ls -lh /var/backups/survei           # berkas baru ber-izin 600 (umask 077 di script)
```

Panggil script dengan `bash scripts/…` (bukan `./scripts/…`): `restore.sh` dan
`test-backup-restore.sh` tidak ber-bit executable di git, dan `chmod +x` manual
di VPS membuat `git pull` berikutnya yang mengubah berkas itu gagal ("local
changes would be overwritten"; pulihkan dengan `git checkout -- scripts/<berkas>`).

`backup.sh` menulis ke `*.partial`, menguji dump & arsip terbaca **utuh**, baru
memberi nama final — backup yang gagal atau dihentikan (Ctrl-C/SIGTERM) tidak
pernah muncul sebagai `db-*.dump`/`minio-*.tar.gz`.

## Jadwalkan harian (cron)

```bash
crontab -e
```

Tambahkan (mis. tiap hari 02:30), arahkan ke folder repo:

```
30 2 * * * cd /var/www/online-survei && bash scripts/backup.sh >> /var/log/survei-backup.log 2>&1
```

## ⚠️ Offsite (sangat disarankan)

Backup di VPS yang sama TIDAK melindungi dari VPS hilang/terhapus. Salin ke
tempat lain — buka komentar di akhir `backup.sh`, contoh:

```
rsync -az /var/backups/survei/ user@host-cadangan:/backup/survei/
# atau: rclone copy /var/backups/survei remote:survei-backup
```

**Enkripsi salinan offsite (opsional, disarankan bila tujuannya pihak ketiga —
object storage, akun cloud, server orang lain).** Backup memuat seluruh data
pribadi responden dalam bentuk terbaca. Enkripsi di VPS sebelum dikirim, dengan
kunci **publik** saja di VPS (kunci privat disimpan di luar VPS — VPS yang
dibobol tak bisa membuka salinan lama):

```bash
# sekali, di laptop admin: age-keygen -o survei-backup.key  → catat "public key: age1…"
# di VPS (apt install age), setelah backup.sh — hasil enkripsi di folder terpisah:
ENC=/var/backups/survei-enc; mkdir -p -m 700 "$ENC"
for f in /var/backups/survei/db-*.dump /var/backups/survei/minio-*.tar.gz; do
  [ -e "$f" ] && [ ! -e "$ENC/${f##*/}.age" ] && age -r age1PUBLIC_KEY_ANDA -o "$ENC/${f##*/}.age" "$f"
done
find "$ENC" -name '*.age' -mtime +14 -delete     # retensi lokal, samakan RETENTION_DAYS
rclone copy "$ENC" remote:survei-backup
# memulihkan: age -d -i survei-backup.key -o db-<TS>.dump db-<TS>.dump.age
```

Alternatif: `gpg --encrypt -r <id>` atau remote `crypt` milik rclone. Kehilangan
kunci privat = backup offsite tak bisa dibuka — simpan bersama kredensial app
(lihat Catatan). Uji dekripsi + restore sesekali.

## Verifikasi backup (lakukan berkala!)

Backup yang tak pernah diuji = belum tentu bisa dipulihkan. Ada uji ROUNDTRIP
otomatis memakai script yang sesungguhnya terhadap container ephemeral: backup →
simulasi migrasi baru (tabel/enum/sequence/kolom/baris + bucket & `.minio.sys`
baru) → restore dari dump/arsip **terpotong** (harus gagal tanpa mengubah apa
pun) → restore sungguhan (DB & volume MinIO harus identik dengan saat backup) →
batalkan dengan dump pengaman.

```bash
docker compose -f docker-compose.backup-test.yml up -d
# tunggu Postgres siap (tanpa ini uji pertama bisa gagal palsu)
until [ "$(docker inspect -f '{{.State.Health.Status}}' \
  "$(docker compose -f docker-compose.backup-test.yml ps -q postgres)")" = healthy ]; do sleep 2; done
bash scripts/test-backup-restore.sh      # → "LULUS" bila restore benar
docker compose -f docker-compose.backup-test.yml down -v
```

Uji ini juga berjalan otomatis di CI (job `backup-restore`). Tetap disarankan
sesekali menguji restore backup PRODUKSI ke environment uji.

---

# Restore

> Restore menimpa data — pastikan timestamp-nya benar. Data yang ditulis
> setelah backup itu HILANG.

## Yang dilakukan `scripts/restore.sh`

- **DB atomik — semua atau tidak sama sekali.** Dump diubah dulu menjadi file SQL
  sementara di dalam container Postgres; dump rusak/terpotong berhenti di sini,
  DB belum disentuh. Lalu dalam **satu transaksi**: `DROP SCHEMA public CASCADE`
  → buat ulang `public` persis bawaan PG16 → jalankan seluruh SQL. Error apa
  pun → `ROLLBACK`, DB persis seperti sebelumnya.
- **Yang tidak ada di backup DIBUANG** — termasuk tabel, tipe enum, sequence,
  kolom, dan baris dari migrasi yang lebih baru dari backup. (Dulu
  `pg_restore --clean` hanya men-drop objek yang ADA di dump; sisa migrasi baru
  tertinggal → skema campuran, dan deploy maju berikutnya gagal
  `already exists`.) Ekstensi `uuid-ossp`/`pgcrypto` ikut dibuat ulang dari dump.
- Hanya skema `public` (satu-satunya yang dipakai survei). Ada skema lain →
  peringatan: objek di skema itu yang **bergantung** pada `public` (view atas
  tabel public, default kolom yang memakai fungsi ekstensi, FK) ikut terhapus
  oleh `CASCADE` dan tidak dibuat ulang.
- **`--latest`** memilih timestamp terbaru dari `db-*.dump` dan mewajibkan
  `minio-<TS>.tar.gz` yang **sama**; bila pasangannya tidak ada (backup MinIO
  gagal), restore ditolak — pilih `<TIMESTAMP>` eksplisit atau `--db-only`.
- **Ctrl-C / SIGTERM / SIGHUP**: script berhenti dan langkah berikutnya tidak
  dijalankan. Bila terjadi saat restore DB, proses `pg_restore`/`psql` di
  container ikut dihentikan (→ `ROLLBACK`) dan hasil akhirnya dilaporkan ("DB
  TIDAK berubah" / "SUDAH ter-COMMIT"). Tetap: jangan Ctrl-C tanpa alasan, dan
  jalankan di `tmux`/`screen` agar SSH putus tidak memutus restore di tengah.
- **Dump pengaman**: sebelum DB ditimpa, keadaan saat ini disimpan ke
  `$BACKUP_DIR/prerestore-db-<TS>.dump`. Gagal dibuat → restore batal sebelum
  data disentuh. Lewati dengan `--no-safety-dump`. Namanya sengaja tak cocok
  `db-*.dump` (tidak dipilih `--latest`/`<TS>`); ikut dibersihkan retensi
  `backup.sh`.
- **MinIO**: arsip diuji utuh (`tar tzf`) sebelum DB maupun MinIO disentuh. Lalu
  SELURUH isi `/data` dihapus — termasuk `.minio.sys` (metadata bucket, IAM) dan
  bucket/objek yang tak ada di backup — dan arsip diekstrak (streaming). Bagian
  ini tidak atomik: bila gagal di tengah ekstraksi, ulangi dengan `--minio-only`.
- **Ruang disk**: puncak pemakaian tambahan ≈ **ukuran DB** (selama transaksi
  salinan lama & baru ada bersamaan; yang lama baru dibuang saat COMMIT) **+
  SQL tak terkompresi** (di `/tmp` container Postgres, beberapa kali ukuran
  `.dump`; uji: 584 KB → 2,7 MB) **+ dump pengaman** (≈ ukuran `.dump`, di
  `/var/backups`) + WAL. Terukur: DB 249 MB → puncak +≈ 1,6 × ukuran DB, ditambah
  dump pengaman. Script mencetak ukuran DB & sisa ruang. Konversi gagal karena
  disk penuh → DB tak disentuh; tetapi disk penuh di fase transaksi bisa
  membuat Postgres error/restart dan mengganggu app lain di VPS. Cek dulu:

  ```bash
  docker exec survei_postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc \
    "SELECT pg_size_pretty(pg_database_size(current_database()))"'                          # ukuran DB
  docker exec -i survei_postgres pg_restore -f - < /var/backups/survei/db-<TS>.dump | wc -c   # SQL (bita)
  df -h /var/lib/docker /var/backups
  ```

  Lokasi SQL lain: `PG_TMPDIR=/path/di/dalam/container bash scripts/restore.sh …`
  (jarang membantu di VPS satu-disk: `/tmp` container & volume Postgres di disk
  yang sama). Sisa `survei-restore-*` di `/tmp` container (bila proses mati
  paksa) boleh dihapus.

## Langkah (disarankan)

Hentikan **backend** (penulis data; juga mencegah app memakai skema yang sedang
diganti) dan **MinIO** (server men-cache `.minio.sys` yang akan diganti; restore
tetap jalan pada container yang berhenti). Frontend & nginx edge
(`survey-populicenter-nginx-1`, melayani app lain) **jangan** dihentikan.
Selama restore, SPA survei tetap terbuka tetapi semua API (login, isi survei,
app Android) gagal 502 — umumkan jendela perawatan.

Jalankan di `tmux`/`screen` (SSH putus tidak memutus restore di tengah), dan
jangan Ctrl-C kecuali perlu — bila terlanjur, baca pesan "DIBATALKAN …" (status
DB dilaporkan) sebelum menyalakan backend, lalu ulangi restore secara utuh.

```bash
cd /var/www/online-survei
tmux new -s restore                     # atau screen
docker compose stop backend minio

bash scripts/restore.sh <TIMESTAMP>     # pulihkan db-<TS>.dump + minio-<TS>.tar.gz
#   bash scripts/restore.sh --latest        # backup terbaru (db & minio TS sama)
#   bash scripts/restore.sh --db-only <TS>  # atau --minio-only <TS>
#   -y lewati konfirmasi; --no-safety-dump lewati dump pengaman

docker compose start minio
docker compose start backend            # menunggu minio healthy; menjalankan migrasi saat start
```

Catatan: backend image `latest` akan menjalankan lagi migrasi yang lebih baru
dari backup saat start (`migrationsRun`). Untuk kembali ke versi kode lama,
lihat [Rollback melewati migrasi](#rollback-melewati-migrasi-yang-tidak-kompatibel).

## Membatalkan restore (dump pengaman)

```bash
docker compose stop backend
bash scripts/restore.sh --db-only --db /var/backups/survei/prerestore-db-<TS>.dump
docker compose start backend
```

Dump pengaman hanya untuk **DB**; isi MinIO yang ditimpa tidak disimpan. Ingin
bisa kembali sepenuhnya (DB + MinIO)? Jalankan `bash scripts/backup.sh` sebelum
restore — lalu restore dengan `<TIMESTAMP>` eksplisit, **bukan** `--latest`
(yang kini akan memilih backup yang baru dibuat itu).

## Rollback melewati migrasi yang tidak kompatibel

Mengganti `IMAGE_TAG` ke commit lama TIDAK membatalkan migrasi yang sudah jalan
(TypeORM `migrationsRun` hanya maju). Bila migrasi itu tidak kompatibel-mundur
(kolom `NOT NULL` baru, rename, ubah enum, dst.), skema harus ikut dikembalikan:

0. **Pastikan image lama ADA** sebelum menghentikan apa pun — bila tag tak ada,
   `up -d` gagal pull dan survei mati dengan DB yang sudah dikembalikan:

   ```bash
   docker manifest inspect ghcr.io/populicenter/survei-backend:sha-<SHA-lama>  >/dev/null && echo ADA
   docker manifest inspect ghcr.io/populicenter/survei-frontend:sha-<SHA-lama> >/dev/null && echo ADA
   ```

1. `bash scripts/backup.sh` (simpan keadaan sekarang — titik kembali lengkap).
2. Pulihkan **DB saja** dari backup **sebelum** deploy yang membawa migrasi itu
   (`--db-only`: berkas MinIO yang diunggah sejak backup tetap ada; objek yatim
   tak berbahaya), lalu jalankan image **lama** — image baru akan menjalankan
   ulang migrasinya:

   ```bash
   docker compose stop backend
   bash scripts/restore.sh --db-only <TS-sebelum-deploy>
   IMAGE_TAG=sha-<SHA-lama> docker compose up -d backend frontend
   ```

3. **Selama `latest` masih membawa migrasi bermasalah, SETIAP
   `docker compose up` wajib memakai `IMAGE_TAG` yang sama** — tanpa itu
   kembali ke `latest` dan migrasinya jalan lagi. Paling aman: tulis sementara
   `IMAGE_TAG=sha-<SHA-lama>` di `.env` root, hapus setelah migrasi perbaikan
   terbit.

Data DB yang masuk sejak backup itu hilang (masih ada di dump pengaman
`prerestore-db-*.dump` untuk rekonsiliasi manual). Karena restore membuang semua
objek migrasi baru, deploy maju berikutnya (dengan migrasi yang sudah
diperbaiki) berjalan bersih tanpa `already exists`. Tips: jalankan
`bash scripts/backup.sh` tepat sebelum deploy yang membawa migrasi, agar ada
titik restore yang segar.

## Manual (rujukan / bila perlu granular)

Padanan langkah script (ganti `<TS>`). Pakai script kecuali benar-benar perlu.
Blok dibungkus `( set -e … )`: bila satu pemeriksaan gagal, langkah destruktif
sesudahnya TIDAK dijalankan (tanpa itu, shell interaktif tetap menjalankan
baris berikutnya).

```bash
( set -e
  B=/var/backups/survei; TS=<TS>; umask 077
  # 0) Dump pengaman — ditulis .partial, diuji utuh, baru diberi nama final
  S="$B/prerestore-db-$(date +%Y%m%d-%H%M%S).dump"
  docker exec survei_postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -F c' > "$S.partial"
  docker exec -i survei_postgres pg_restore -f /dev/null < "$S.partial"
  mv "$S.partial" "$S"

  # 1) Uji arsip MinIO dulu (sebelum DB maupun MinIO disentuh)
  docker run --rm -i alpine sh -c 'tar tzf - >/dev/null' < "$B/minio-$TS.tar.gz"

  # 2) PostgreSQL: arsip → SQL sementara, lalu ganti skema public dalam SATU transaksi
  docker exec -i survei_postgres sh -c '
    set -e; tmp=$(mktemp /tmp/survei-restore-XXXXXX); trap "rm -f $tmp" EXIT
    pg_restore --no-owner -f "$tmp"
    psql -X -q -v ON_ERROR_STOP=1 --single-transaction -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
      -c "SET client_min_messages = warning" \
      -c "DROP SCHEMA IF EXISTS public CASCADE" \
      -c "CREATE SCHEMA public AUTHORIZATION pg_database_owner" \
      -c "GRANT USAGE ON SCHEMA public TO PUBLIC" \
      -c "COMMENT ON SCHEMA public IS '"'"'standard public schema'"'"'" \
      -f "$tmp" >/dev/null' < "$B/db-$TS.dump"

  # 3) MinIO: kosongkan SELURUH /data (termasuk .minio.sys) & ekstrak
  docker run --rm -i --volumes-from survei_minio alpine \
    sh -c 'set -e; mountpoint -q /data; find /data -mindepth 1 -delete; cd /data; tar xzf -' \
    < "$B/minio-$TS.tar.gz"
)
```

Catatan: Ctrl-C pada blok manual TIDAK menghentikan proses di container
(klien `docker exec` keluar, prosesnya jalan terus) — script menangani ini,
blok manual tidak.

`rm -rf /data/*` TIDAK cukup: glob `*` melewatkan entri ber-titik seperti
`/data/.minio.sys`, sehingga metadata basi tertinggal.

## Catatan

- Selalu pilih **db** dan **minio** dari **timestamp yang sama** (`<TIMESTAMP>`
  atau `--latest`) agar rujukan berkas pada jawaban survei tetap cocok.
- Simpan kredensial (`DB_PASSWORD`, `MINIO_ROOT_PASSWORD`, `JWT_SECRET`, dll)
  di tempat aman — backup data saja tak cukup tanpa secrets untuk menjalankan app.
  Kunci privat enkripsi offsite (bila dipakai) disimpan di tempat yang sama.
