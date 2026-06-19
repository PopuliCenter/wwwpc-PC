# Panduan Survei Eksperimen & Percabangan Pertanyaan

Panduan membuat survei yang **bercabang** — tiap responden bisa mendapat
rangkaian pertanyaan berbeda sampai akhir. Ada dua cara, dan keduanya bisa
digabung dalam satu survei.

> **Soal pertanyaan WAJIB di cabang yang tidak dilalui:** aman. Sistem otomatis
> mengabaikan pertanyaan wajib yang berada di cabang yang **tidak ditampilkan**
> ke responden — jadi tidak akan memblokir tombol kirim.

---

## Cara 1 — Cabang berdasarkan PILIHAN responden

Responden memilih sebuah opsi, lalu mendapat pertanyaan lanjutan sesuai
pilihannya. Cocok untuk: "Jika memilih A, tanyakan A1, A2…".

**Langkah:**
1. Buat pertanyaan induk (mis. Pilihan Tunggal) dengan opsi A, B, C.
2. Buat pertanyaan tiap cabang (A1, A2, B1, …) seperti biasa.
3. Pada tiap pertanyaan cabang, buka tab **"Aturan Tampil"** →
   *Tampilkan jika* **[pertanyaan induk]** = **opsi yang sesuai**.
   - A1, A2 → *tampil jika induk = A*
   - B1, B2 → *tampil jika induk = B*
4. (Opsional) Centang **"Acak urutan opsi"** pada pertanyaan induk agar urutan
   A/B/C diacak tampilannya.

Sudah tersedia tanpa setelan tambahan.

---

## Cara 2 — Cabang DIACAK otomatis (eksperimen / split-ballot)

Sistem **mengundi** tiap responden ke salah satu *kelompok* (arm) — terlepas
dari jawabannya — dan tiap kelompok mendapat pertanyaan berbeda. Cocok untuk:
uji A/B versi pertanyaan, vinyet acak, eksperimen survei. Kode kelompok ikut
tersimpan & ter-export untuk analisis (SPSS).

**Langkah:**
1. Tambah pertanyaan bertipe **"Penugasan Acak (Eksperimen)"**
   (grup *Eksperimen* di tombol tambah pertanyaan).
2. Isi daftar **Kelompok**: tiap baris punya **Kode** (angka, mis. 1, 2, 3) dan
   **Nama** (mis. "Pesan A"). Minimal 2 kelompok. Peluang antar-kelompok **sama rata**.
   - Pertanyaan ini **tidak ditampilkan** ke responden; nilainya diundi sistem
     sekali per responden dan **tetap** selama ia mengisi.
3. Buat pertanyaan tiap kelompok (mis. K1a, K1b untuk kelompok 1).
4. Pada tiap pertanyaan kelompok, buka **"Aturan Tampil"** →
   *Tampilkan jika* **[Penugasan Acak]** = **kode kelompoknya** (1, 2, …).

Hasilnya: tiap responden diacak ke satu kelompok, lalu hanya melihat pertanyaan
kelompok itu sampai akhir. Kolom kode kelompok muncul di export untuk dipakai
sebagai variabel kelompok di SPSS.

---

## Menggabungkan keduanya

Boleh. Contoh: kelompok diundi acak (Cara 2) menentukan **versi** pertanyaan,
lalu di dalamnya percabangan mengikuti **pilihan** responden (Cara 1). Cukup
tumpuk aturan tampil — mis. *tampil jika [Penugasan Acak] = 2 **dan** [induk] = A*
(buat dua aturan tampil pada pertanyaan yang sama).

---

## Catatan teknis (untuk admin/analis)

- Penugasan kelompok disimpan sebagai jawaban biasa → otomatis masuk **export**
  (kode angka) dan terlihat di **Detail Respons**.
- Penugasan **stabil**: sekali diundi saat responden membuka survei, tidak
  berubah meski ia menutup dan melanjutkan.
- Validasi wajib **sadar-cabang**: pertanyaan wajib di kelompok/cabang yang tidak
  aktif tidak diminta diisi.
- Saat ini ditujukan untuk alur **isi-mandiri responden** (bukan surveyor/TPD).
