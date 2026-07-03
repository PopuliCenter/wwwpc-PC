# Beralih ke Resend untuk Email (Antisipasi Skala)

Status saat ini: email (OTP registrasi, OTP penukaran, konfirmasi survei, dll.)
dikirim via **SMTP cPanel Niagahoster** (`srv90.niagahoster.com`). Cukup untuk
tahap awal, tetapi shared hosting punya **batas kirim per jam** (umumnya ~300–500
email/jam) dan reputasi pengiriman ke Gmail terbatas → OTP bisa lambat/masuk spam
saat trafik tinggi.

**Resend** (layanan email transaksional via HTTP API) mengatasi ini: tanpa batas
koneksi SMTP, dibuat untuk volume tinggi, deliverability ke Gmail lebih baik.
Kode backend **sudah mendukung Resend** (`EmailProcessor.sendViaResend`), jadi
peralihan hanya butuh konfigurasi — tanpa ubah kode.

## Kapan beralih

Beralih saat pengguna aktif mulai banyak / OTP terasa lambat berulang / mendekati
batas kirim hosting. Untuk testing & pemakaian ringan, SMTP cPanel masih memadai.

## Langkah setup

### 1. Buat akun + tambah domain di Resend
1. Daftar di https://resend.com (ada tier gratis: 3.000 email/bulan, 100/hari).
2. Menu **Domains → Add Domain** → masukkan `populicenter.org`.
3. Resend akan menampilkan **beberapa record DNS** yang harus ditambahkan
   (nilainya spesifik per-domain, jadi SALIN dari dashboard Resend — jangan
   mengarang). Umumnya:
   - **MX** untuk subdomain pengirim (mis. `send.populicenter.org`)
   - **TXT (SPF)** untuk subdomain pengirim
   - **TXT/CNAME (DKIM)** — kunci penandatangan
   - (opsional) **TXT (DMARC)** di `_dmarc.populicenter.org`

### 2. Tambahkan record di Cloudflare
1. Dashboard Cloudflare → domain `populicenter.org` → **DNS → Records**.
2. Tambahkan tiap record persis seperti yang Resend berikan.
3. **PENTING:** set semua record ini **DNS only (awan abu-abu)**, jangan diproxy.
   (Sama seperti gotcha SMTP — Cloudflare proxy hanya untuk HTTP/HTTPS. Untuk MX
   memang tak bisa diproxy; untuk TXT/CNAME email pastikan grey-cloud.)
4. Kembali ke Resend → **Verify**. Biasanya aktif dalam beberapa menit.

### 3. Ambil API key
Resend → **API Keys → Create** → salin (format `re_...`). Simpan aman.

### 4. Ubah `backend/.env` di VPS
```env
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
# MAIL_FROM tetap; domain pengirim HARUS domain yg diverifikasi di Resend:
MAIL_FROM=Populi Center <info@populicenter.org>
```
Baris `SMTP_*` boleh dibiarkan (diabaikan saat `EMAIL_PROVIDER=resend`) sebagai
cadangan.

### 5. Deploy
```bash
cd /var/www/online-survei
docker compose up -d --force-recreate backend
```
Tak perlu rebuild image (cuma perubahan env).

### 6. Verifikasi
- Picu OTP (registrasi/penukaran) → cek email masuk cepat.
- Log: `docker compose logs backend --since 5m | grep -iE "EmailProcessor|Resend"`.
  Sukses = `Email sent successfully`. Gagal = `Resend gagal (4xx/5xx): ...`
  (mis. domain belum terverifikasi, atau `from` bukan domain terverifikasi).

## Rollback ke SMTP
Set `EMAIL_PROVIDER=smtp` lagi di `.env` lalu `docker compose up -d --force-recreate backend`.

## Catatan deliverability
- `from` **wajib** memakai domain yang diverifikasi di Resend, kalau tidak Resend
  menolak (HTTP 403).
- Pertahankan SPF/DKIM. Tambah DMARC (`p=none` dulu) untuk memantau.
- Lihat juga [[smtp-cloudflare-proxy-gotcha]] (memory) — prinsip grey-cloud yang
  sama berlaku untuk record email di Cloudflare.
