# Panduan Pembersihan Data Respons (Data Cleanup)

Panduan ini menjelaskan **aturan** dan **langkah** membersihkan data respons survei:
kapan harus **Arsip**, kapan harus **Hapus**, apa efeknya ke kuota dan kemampuan
responden mengisi ulang, serta jejak audit. Ditujukan untuk admin (bahasa awam).

---

## 1. Dua cara membersihkan: Arsip vs Hapus

Di halaman **Manajemen Respons** setiap baris respons punya tiga tombol:
**Detail**, **Arsip**, dan **Hapus**.

|                                 | **Arsip** (disarankan)                    | **Hapus** (permanen)                          |
| ------------------------------- | ----------------------------------------- | --------------------------------------------- |
| Data jawaban                    | **Tetap tersimpan**                       | **Hilang permanen** (tidak bisa dikembalikan) |
| Muncul di daftar aktif          | Tidak (tersembunyi)                       | Tidak                                         |
| Bisa dilihat lagi               | Ya — lewat tombol **"Tampilkan arsip"**   | Tidak pernah                                  |
| Responden bisa isi ulang survei | **Ya**                                    | **Ya**                                        |
| Kuota responden                 | Dikembalikan (jika respons sudah selesai) | Dikembalikan (jika respons sudah selesai)     |
| Tercatat di audit               | Ya                                        | Ya                                            |
| Masuk hasil export              | Tidak                                     | Tidak                                         |

> **Aturan utama: utamakan ARSIP, bukan Hapus.**
> Arsip memberi efek yang sama (responden bisa mengisi ulang, kuota kembali)
> tetapi datanya **tidak hilang** dan bisa dipulihkan/ditinjau. Pakai **Hapus**
> hanya untuk data uji coba (testing) atau data yang benar-benar tidak boleh ada.

---

## 2. Aturan: kapan pakai yang mana

**Pakai ARSIP bila:**

- Responden salah isi dan minta mengisi ulang.
- Pengisian tertahan / waktu habis sehingga responden terkunci, padahal ia
  belum benar-benar menyelesaikan survei.
- Ada respons mencurigakan (mis. lokasi menumpuk tidak wajar) yang ingin
  disisihkan dari analisis **tanpa menghapus bukti**.
- Ragu. Kalau ragu, **selalu Arsip** — bisa dibatalkan dengan meninjau arsip.

**Pakai HAPUS bila:**

- Data hasil **uji coba/testing** sebelum survei live.
- Respons duplikat/sampah yang dipastikan tidak akan dipakai dan tidak perlu
  jejak datanya.
- Permintaan penghapusan data pribadi (mis. responden mencabut persetujuan dan
  meminta datanya dihapus sepenuhnya).

**JANGAN Hapus** data respons asli dari lapangan hanya untuk "merapikan tampilan"
— gunakan **Tampilkan arsip = off** untuk menyembunyikannya, jangan dihapus.

---

## 3. Tutorial langkah demi langkah

### A. Mengarsipkan satu respons

1. Buka menu **Manajemen Respons**.
2. Di kotak **Survei** (paling atas), **pilih survei** — daftar respons baru
   muncul setelah survei dipilih. (Sengaja kosong di awal agar tidak menampilkan
   semua data sekaligus.)
3. Cari baris respons yang dituju (bisa klik judul kolom untuk mengurutkan).
4. Klik **Arsip** pada baris itu.
5. Muncul konfirmasi → klik **OK**.
6. Baris hilang dari daftar aktif. Untuk melihatnya lagi, aktifkan
   **"Tampilkan arsip"**; respons terarsip diberi label **Terarsip**.

### B. Menghapus satu respons (permanen)

1. Langkah 1–3 sama seperti di atas.
2. Klik **Hapus** (tombol merah) pada baris itu.
3. Baca konfirmasi baik-baik → klik **OK**.
4. Data jawaban terhapus permanen dan responden kini bisa mengisi survei ini lagi.

### C. Membuat responden bisa mengisi ulang

Baik **Arsip** maupun **Hapus** akan **membebaskan** responden untuk mengisi
survei yang sama lagi. Tidak perlu langkah tambahan — cukup arsipkan/hapus respons
lamanya, lalu minta responden membuka survei dan mengisi kembali.

---

## 4. Efek ke kuota & status

- Jika respons yang diarsip/dihapus berstatus **selesai (COMPLETE)**, kuota
  survei (jumlah responden terpakai) **dikurangi 1** secara otomatis — jadi slot
  kembali tersedia.
- Respons yang masih **berjalan/belum selesai** tidak memakai kuota, jadi tidak
  ada perubahan hitungan saat diarsip/dihapus.
- Kunci unik **(survei, responden)** ikut terbebas, itulah yang membuat responden
  bisa mengisi ulang.

---

## 5. Jejak audit

Setiap **Arsip** dan **Hapus** dicatat di **log audit** (tipe `DATA_CLEANUP`)
beserta: siapa adminnya, ID respons, ID survei, dan alamat IP. Artinya tindakan
pembersihan **dapat dipertanggungjawabkan** dan bisa ditelusuri bila diperlukan.

---

## 6. "Sudah klik Hapus tapi tidak ada hasil" — pemecahan masalah

Jika tombol **Hapus/Arsip** tidak ada atau klik tidak berefek:

1. **Pastikan versi aplikasi di server sudah ter-update.** Fitur Arsip/Hapus
   ditambahkan pada pembaruan terbaru. Jika server belum di-_rebuild_, tombolnya
   tidak muncul atau tidak berfungsi. Di VPS jalankan:

   ```bash
   cd /var/www/online-survei
   git pull                     # pastikan commit terbaru tertarik
   docker compose up -d --build backend frontend
   ```

   > Reboot VPS **tidak** cukup — image harus di-_build_ ulang dengan perintah di atas.

2. **Refresh browser** (sekali) setelah update agar tampilan lama tergantikan.

3. **Pastikan sudah memilih survei** di filter atas — bila belum, daftar memang
   kosong sehingga tidak ada baris untuk dihapus.

4. **Cek hak akses.** Hanya **Admin / Super Admin** yang boleh Arsip/Hapus.
   Peran **Analyst** hanya bisa melihat & export.

5. Jika muncul peringatan "Gagal menghapus respons", cek log backend:
   ```bash
   docker compose logs --tail=100 backend
   ```

---

## 7. Praktik baik (ringkas)

- **Arsip dulu, hapus belakangan** — hapus hanya bila yakin.
- **Bersihkan data testing sebelum survei live**, supaya angka analisis bersih.
- **Jangan hapus data lapangan asli** untuk merapikan tampilan; sembunyikan
  dengan mematikan "Tampilkan arsip".
- **Export dulu** (Excel/CSV) sebelum penghapusan massal, sebagai cadangan.
- Lakukan pembersihan oleh **satu admin penanggung jawab** agar audit rapi.
