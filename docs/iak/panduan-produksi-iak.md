# Checklist Beralih ke IAK Produksi (Reward / Top-up)

Panduan langkah-demi-langkah memindahkan fulfillment reward dari **sandbox** ke
**produksi** IAK (iak.id / Mobilepulsa). Ikuti berurutan; centang tiap langkah.

> Ringkas: ganti kredensial + base URL produksi di `backend/.env`, whitelist IP
> server di IAK, daftarkan URL callback, lalu uji 1 transaksi kecil.

---

## 0. Prasyarat

- [ ] Akun **produksi** IAK aktif (bukan akun development).
- [ ] **Username produksi** + **API key produksi** sudah didapat dari dashboard IAK.
      (Key development lama JANGAN dipakai di produksi — sudah perlu dirotasi.)
- [ ] **Saldo deposit** produksi sudah di-top-up (transaksi nyata memotong saldo ini).
- [ ] Daftar harga produksi (pricelist) untuk verifikasi **kode produk**.

## 1. Whitelist IP server di IAK (WAJIB)

- [ ] Ambil IP publik VPS:
      `bash
    curl -s https://api.ipify.org; echo
    `
- [ ] Daftarkan IP itu ke **whitelist H2H** di dashboard IAK.
      Tanpa whitelist, request produksi ditolak.

## 2. Daftarkan URL callback di IAK

- [ ] Set callback / report URL di dashboard IAK ke:
      `     https://survei.risetcenter.com/api/rewards/callback/iak
    `

## 3. Update `backend/.env` di VPS

File `backend/.env` dibuat manual di server (tidak ada di git). Set:

```bash
REWARD_PROVIDER=iak
IAK_BASE_URL=https://prepaid.iak.id        # PRODUKSI (sandbox: https://prepaid.iak.dev)
IAK_USERNAME=<username_produksi>
IAK_API_KEY=<api_key_produksi>
IAK_VERIFY_CALLBACK_SIGN=true
# Kosongkan/hapus baris ini — hanya untuk sandbox (memaksa 1 kode utk semua):
# IAK_TEST_PRODUCT_CODE=
```

- [ ] `REWARD_PROVIDER=iak`
- [ ] `IAK_BASE_URL=https://prepaid.iak.id`
- [ ] `IAK_USERNAME` & `IAK_API_KEY` = kredensial produksi
- [ ] `IAK_TEST_PRODUCT_CODE` dihapus/dikosongkan
- [ ] `IAK_VERIFY_CALLBACK_SIGN=true`

## 4. Verifikasi kode produk (`IAK_PRODUCT_MAP`)

Sistem punya peta default 50 kode produk (mis. `htelkomsel10000`, `dana25`).
Cocokkan dengan pricelist produksi Anda. Bila ada kode yang berbeda, override
lewat env (JSON satu baris). Contoh:

```bash
IAK_PRODUCT_MAP={"telkomsel:pulsa-10000":"HTELKOMSEL10","ewallet-dana-25000":"DANA25"}
```

Format kunci:

- Pulsa / paket data (operator-spesifik): `"<operator>:<rewardId>"`
  (operator: `telkomsel|indosat|xl|axis|tri|smartfren`). Fallback ke `"<rewardId>"`
  bila operator tak ada di map.
- Voucher / e-wallet: `"<rewardId>"`.

- [ ] Kode produk sudah dicek terhadap pricelist produksi
- [ ] `IAK_PRODUCT_MAP` di-set bila ada perbedaan

## 5. Terapkan perubahan

Perubahan `.env` tidak perlu rebuild image — cukup recreate container agar
membaca env baru:

```bash
cd /var/www/online-survei
docker compose up -d backend
```

- [ ] Container backend ter-recreate tanpa error (`docker compose ps`)

## 6. Uji 1 transaksi kecil (end-to-end)

- [ ] Lakukan **satu penukaran nominal terkecil** (mis. pulsa 5rb–10rb) dari akun
      responden uji.
- [ ] Status penukaran menjadi **sukses**.
- [ ] Callback IAK masuk:
      `bash
    docker compose logs --tail=100 backend | grep -i iak
    `
- [ ] Poin responden terpotong; **saldo deposit IAK** berkurang sesuai.

---

## Catatan

- **Signature & idempoten** otomatis: `sign = md5(username + api_key + ref_id)`.
  Begitu kredensial produksi diisi, top-up & callback ikut diverifikasi dengan
  kredensial baru. `ref_id` ringkas → idempoten (aman dari pemrosesan ganda).
- **Refund otomatis**: bila top-up gagal, poin responden dikembalikan — aman saat uji.
- **Peluncuran bertahap (disarankan)**: set `REWARD_PROVIDER=manual` dulu (penukaran
  masuk antrean untuk diproses admin), baru pindah ke `iak` setelah callback uji
  berhasil.
- **Rollback ke sandbox**: ganti `IAK_BASE_URL` + kredensial dev, lalu
  `docker compose up -d backend` lagi.
- **Status prepaid IAK** (konfirmasi dengan dokumen akun): `0=proses, 1=sukses,
2=gagal`. Kasus tak pasti → diperlakukan `pending` (tidak memicu refund keliru;
  diselesaikan via callback/cek-status).

Referensi kode: `backend/src/modules/reward/fulfillment/iak.provider.ts`,
`iak-products.ts` (peta kode default), `reward-callback.controller.ts` (endpoint
callback `POST /api/rewards/callback/iak`).
