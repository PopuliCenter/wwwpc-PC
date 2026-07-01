# Reset Poin Sebelum Go‑Live (sekali jalan)

Setelah nilai tukar diubah jadi **1 poin = Rp 10**, saldo poin lama bernilai 20×
lebih. Agar tidak ada "durian runtuh" saat produksi, **kosongkan saldo poin lama
SEKALI** tepat sebelum membuka untuk responden nyata.

> ⚠️ **PERMANEN & tidak bisa dibatalkan.** Jalankan **hanya sekali**, saat belum
> ada responden nyata yang ingin dipertahankan saldonya. Setelah ini, poin baru
> akan terkumpul normal.

Tabel yang direset:

- `point_transaction` — buku besar poin (saldo dihitung dari sini → jadi 0 untuk semua).
- `reward_redemption` — riwayat penukaran (uji).
- `streak_tracker` — hitung streak bonus (mulai dari nol lagi).

Tidak ada kolom saldo ter‑cache di tabel user, jadi mengosongkan `point_transaction`
sudah menolkan semua saldo.

## Langkah (di VPS)

```bash
cd /var/www/online-survei

# 1) (disarankan) cadangkan dulu ke file di host
docker compose exec -T postgres pg_dump -U postgres -d survei_online \
  -t point_transaction -t reward_redemption -t streak_tracker \
  > backup_poin_$(date +%F).sql

# 2) RESET (kosongkan saldo poin lama)
docker compose exec -T postgres psql -U postgres -d survei_online \
  -c "TRUNCATE point_transaction, reward_redemption, streak_tracker;"

# 3) Verifikasi — semua harus 0
docker compose exec -T postgres psql -U postgres -d survei_online \
  -c "SELECT (SELECT count(*) FROM point_transaction) AS poin, (SELECT count(*) FROM reward_redemption) AS penukaran, (SELECT count(*) FROM streak_tracker) AS streak;"
```

## Varian

- **Hanya nolkan saldo, simpan riwayat penukaran:**
  ```bash
  docker compose exec -T postgres psql -U postgres -d survei_online \
    -c "TRUNCATE point_transaction, streak_tracker;"
  ```
- **Reset 1 responden tertentu** (mis. akun uji), bukan semua:
  ```bash
  docker compose exec -T postgres psql -U postgres -d survei_online \
    -c "DELETE FROM point_transaction WHERE user_id = '<UUID_USER>';"
  ```

## Catatan

- Nama service Postgres di compose = `postgres`, user `postgres`, db `survei_online`.
- Akun & profil responden TIDAK terhapus — hanya saldo/penukaran/streak.
- Jalankan **setelah** deploy versi nilai tukar baru (commit `9a1ac73`) agar konsisten.
