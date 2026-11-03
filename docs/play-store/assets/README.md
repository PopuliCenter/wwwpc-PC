# Aset Grafis Play Store — Riset Populi Center

## Sudah jadi ✅

| Berkas                         | Ukuran   | Alpha | Dipakai di Play Console                  |
| ------------------------------ | -------- | ----- | ---------------------------------------- |
| `icon-512.png`                 | 512×512  | tidak | **App icon** (Main store listing)        |
| `feature-graphic-1024x500.png` | 1024×500 | tidak | **Feature graphic** (Main store listing) |

Keduanya **tanpa transparansi** — Play menolak aset ber-alpha. Ikon memakai logo
putih di atas oranye merek (`#F26522`), sama dengan ikon aplikasi di HP. Feature
graphic memakai latar navy rata `#0F2342`, logo oranye (kontras 4,97:1), judul putih
(15,68:1), dan satu keterangan `#AECAE9` (9,28:1), tanpa gradien, lingkaran, dan pill.

Skrip yang sama juga menghasilkan ikon PWA di `frontend/public/icons/`: `icon-192.png`,
`icon-512.png`, dan `icon-maskable-512.png` (logo di dalam area aman 80%).

Teks feature graphic memakai font yang terpasang di komputer pembuat: Source Serif 4
dan IBM Plex Sans bila ada, selain itu Georgia dan Roboto, Segoe UI, atau Arial.

### Mengubah aset (mis. ganti tagline/warna)

Edit `generate-assets.js`, lalu jalankan **dari root repo** (butuh `sharp`, sudah
ada di `node_modules` root):

```bash
node docs/play-store/assets/generate-assets.js
```

---

## Masih perlu Anda buat: SCREENSHOT 📱

Play mewajibkan **minimal 2** screenshot HP (disarankan **4–8**). Ini tidak bisa
digenerate otomatis — ambil langsung dari HP yang sudah terpasang APK rilis.

**Syarat Play:**

- Format PNG atau JPEG, tanpa transparansi
- Sisi terpendek minimal **320 px**, sisi terpanjang maksimal **3840 px**
- Rasio antara 16:9 dan 9:16 (screenshot HP normal sudah memenuhi)

**Cara ambil:** buka aplikasi di HP → tekan **Power + Volume Bawah**.

**Saran 5 layar (urutan ini menjelaskan alur produk ke calon pengguna):**

1. **Daftar Survei** — memperlihatkan survei tersedia + poin & estimasi waktu
2. **Isi Survei** — halaman pertanyaan (tunjukkan progress bar)
3. **Reward** — katalog penukaran (pulsa & e-wallet)
4. **Riwayat Poin** — saldo & riwayat transaksi
5. **Profil** — termasuk menu Hapus Akun

> Tips: pakai akun uji dengan beberapa survei & poin terisi, agar layar tidak
> tampak kosong. Hindari menampilkan data pribadi asli responden.
