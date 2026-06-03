# Dokumen Kebutuhan Sistem

## Pendahuluan

Dokumen ini mendefinisikan kebutuhan untuk Sistem Survei Online berbasis web yang memungkinkan responden mendaftar secara mandiri, menerima undangan survei melalui email, mengisi survei, dan mendapatkan poin reward yang dapat ditukarkan dengan pulsa telepon, paket data, voucher belanja, atau transfer e-wallet. Sistem ini menyediakan dashboard admin yang komprehensif, survey builder dengan logika lanjutan, manajemen pengguna, audit log, export data, dan fitur pembersihan data terkontrol.

## Glosarium

- **Sistem**: Aplikasi web Sistem Survei Online secara keseluruhan
- **Modul_Registrasi**: Komponen yang bertanggung jawab atas pendaftaran mandiri, verifikasi OTP, dan penyelesaian profil
- **Survey_Builder**: Komponen yang memungkinkan admin membuat, mengedit, menduplikasi, menonaktifkan, menghapus, dan mengarsipkan survei beserta pertanyaannya
- **Dashboard**: Komponen analitik untuk admin yang menampilkan statistik, chart, dan analisis per pertanyaan
- **Layanan_Notifikasi**: Komponen yang bertanggung jawab mengirim notifikasi email (undangan, pengingat, konfirmasi)
- **Manajer_Respons**: Komponen yang menerima, menyimpan, memfilter, dan mengelola respons survei dari responden
- **Modul_Export**: Komponen yang menghasilkan export data dalam format CSV, Excel, PDF, dan JSON
- **Audit_Logger**: Komponen yang mencatat dan menyimpan semua aktivitas sistem untuk penelusuran
- **Manajer_Pengguna**: Komponen yang bertanggung jawab atas kontrol akses berbasis peran dan administrasi akun pengguna
- **Modul_Pembersihan_Data**: Komponen yang menangani penghapusan terkontrol, pengarsipan, dan pembersihan data
- **Mesin_Reward**: Komponen yang mengelola akumulasi poin, pelacakan saldo, kadaluarsa, dan penukaran
- **Layanan_Geolokasi**: Komponen yang mendeteksi, menyimpan, dan menyediakan data geografis responden
- **Responden**: Pengguna publik yang mendaftar mandiri untuk mengisi survei dan mengumpulkan poin
- **Super_Admin**: Peran pengguna dengan akses penuh tanpa batasan ke semua fitur sistem
- **Admin**: Peran pengguna yang dapat membuat/mengedit/menduplikasi/menonaktifkan survei, melihat dashboard, export data, dan melakukan pembersihan data
- **Analis**: Peran pengguna yang dapat melihat dashboard dan data, export hasil, tetapi tidak dapat membuat atau mengedit survei
- **Viewer**: Peran pengguna dengan akses baca-saja ke dashboard dan laporan
- **OTP**: One-Time Password, kode numerik 6 digit yang dikirim via email untuk verifikasi
- **Skip_Logic**: Logika survei yang melewatkan pertanyaan atau halaman berdasarkan jawaban responden
- **Poin_Reward**: Unit nilai yang diperoleh responden dari mengisi survei dan dapat ditukarkan dengan reward
- **Reward_Manual**: Mode reward dimana admin secara manual mendistribusikan reward (pulsa/paket data/e-wallet) ke responden setelah survei selesai, berdasarkan data nomor telepon/akun yang dikumpulkan

## Kebutuhan

### Kebutuhan 1: Registrasi Mandiri Responden

**User Story:** Sebagai responden, saya ingin mendaftar sendiri di platform tanpa perlu undangan admin, agar saya dapat berpartisipasi dalam survei dan mendapatkan reward.

#### Kriteria Penerimaan

1. Modul_Registrasi HARUS menampilkan form pendaftaran yang meminta nama lengkap, alamat email, nomor telepon, kata sandi, dan checkbox persetujuan syarat & ketentuan.
2. KETIKA responden mengirim form pendaftaran, Modul_Registrasi HARUS memvalidasi bahwa kata sandi mengandung minimal 8 karakter, minimal 1 huruf kapital, dan minimal 1 angka.
3. KETIKA responden mengirim form pendaftaran, Modul_Registrasi HARUS memverifikasi bahwa alamat email yang diberikan belum terdaftar di sistem.
4. KETIKA responden mengirim form pendaftaran, Modul_Registrasi HARUS memverifikasi bahwa nomor telepon yang diberikan belum terdaftar di sistem.
5. JIKA email duplikat terdeteksi saat registrasi, MAKA Modul_Registrasi HARUS menolak pengiriman dan menampilkan pesan error yang menunjukkan email sudah terdaftar.
6. JIKA nomor telepon duplikat terdeteksi saat registrasi, MAKA Modul_Registrasi HARUS menolak pengiriman dan menampilkan pesan error yang menunjukkan nomor telepon sudah terdaftar.
7. KETIKA validasi registrasi berhasil, Modul_Registrasi HARUS mengirim kode OTP 6 digit ke alamat email responden.
8. Modul_Registrasi HARUS memberlakukan masa berlaku maksimal 15 menit untuk setiap kode OTP.
9. Modul_Registrasi HARUS mengizinkan maksimal 3 permintaan kirim ulang OTP per percobaan registrasi.
10. KETIKA responden memasukkan OTP yang valid dalam masa berlaku, Modul_Registrasi HARUS menandai email sebagai terverifikasi dan melanjutkan ke penyelesaian profil.
11. JIKA OTP yang tidak valid atau kadaluarsa dimasukkan, MAKA Modul_Registrasi HARUS menolak verifikasi dan menampilkan pesan error yang sesuai.

### Kebutuhan 2: Penyelesaian Profil

**User Story:** Sebagai responden, saya ingin melengkapi profil dengan informasi demografis, agar saya dapat menerima undangan survei yang relevan.

#### Kriteria Penerimaan

1. KETIKA verifikasi email berhasil, Modul_Registrasi HARUS menampilkan form penyelesaian profil yang meminta usia, jenis kelamin, pekerjaan, dan kota/provinsi.
2. KETIKA responden memberikan izin geolokasi, Layanan_Geolokasi HARUS mendeteksi otomatis kota dan provinsi responden melalui reverse geocoding dan mengisi otomatis field lokasi.
3. JIKA responden menolak izin geolokasi, MAKA Modul_Registrasi HARUS mengizinkan pengisian manual kota dan provinsi.
4. KETIKA form penyelesaian profil dikirim dengan data yang valid, Modul_Registrasi HARUS mengaktifkan akun responden dan menandainya sebagai layak menerima undangan survei.

### Kebutuhan 3: Autentikasi

**User Story:** Sebagai responden, saya ingin login dengan aman menggunakan kredensial saya, agar saya dapat mengakses akun dan survei saya.

#### Kriteria Penerimaan

1. Sistem HARUS menampilkan form login yang meminta alamat email dan kata sandi.
2. KETIKA kredensial yang valid dikirim, Sistem HARUS mengautentikasi responden dan membuat sesi aktif.
3. JIKA kredensial yang tidak valid dikirim, MAKA Sistem HARUS menolak percobaan login dan menampilkan pesan error generik tanpa mengungkapkan field mana yang salah.
4. KETIKA responden meminta reset kata sandi, Sistem HARUS mengirim tautan reset kata sandi ke alamat email yang terdaftar.

### Kebutuhan 4: Notifikasi Email

**User Story:** Sebagai responden, saya ingin menerima notifikasi email tepat waktu tentang survei dan reward, agar saya tetap terinformasi dan tidak melewatkan deadline.

#### Kriteria Penerimaan

1. KETIKA survei diaktifkan, Layanan_Notifikasi HARUS mengirim email undangan survei baru ke semua responden yang memenuhi syarat.
2. SELAMA survei aktif dan tersisa 3 hari sebelum deadline, Layanan_Notifikasi HARUS mengirim email pengingat (H-3) ke responden yang belum mengisi survei.
3. SELAMA survei aktif dan tersisa 1 hari sebelum deadline, Layanan_Notifikasi HARUS mengirim email pengingat (H-1) ke responden yang belum mengisi survei.
4. KETIKA responden berhasil mengirim respons survei, Layanan_Notifikasi HARUS mengirim email konfirmasi pengiriman ke responden.
5. KETIKA saldo poin responden mencapai threshold minimum penukaran 10.000 poin, Layanan_Notifikasi HARUS mengirim email notifikasi poin.
6. KETIKA penukaran reward berhasil diproses, Layanan_Notifikasi HARUS mengirim email konfirmasi penukaran ke responden.

### Kebutuhan 5: Dashboard Admin

**User Story:** Sebagai admin, saya ingin melihat analitik dan statistik real-time, agar saya dapat memantau performa survei dan keterlibatan responden.

#### Kriteria Penerimaan

1. Dashboard HARUS menampilkan jumlah responden yang terdaftar dalam 24 jam terakhir.
2. Dashboard HARUS menampilkan total jumlah responden terdaftar.
3. Dashboard HARUS menampilkan jumlah survei yang sedang aktif.
4. Dashboard HARUS menampilkan total jumlah entri data (respons survei) yang terkumpul.
5. Dashboard HARUS menampilkan bar chart yang menunjukkan registrasi responden harian.
6. Dashboard HARUS menampilkan line chart yang menunjukkan tren kumulatif responden dari waktu ke waktu.
7. Dashboard HARUS menampilkan pie atau donut chart yang menunjukkan distribusi responden berdasarkan wilayah, kelompok usia, dan pekerjaan.
8. Dashboard HARUS menampilkan heat map yang menunjukkan distribusi geografis responden.
9. Dashboard HARUS menampilkan tingkat penyelesaian untuk setiap survei aktif.
10. SELAMA pengguna dengan peran Analis atau Viewer login, Dashboard HARUS menampilkan data dalam mode baca-saja tanpa kontrol edit.

### Kebutuhan 6: Survey Builder

**User Story:** Sebagai admin, saya ingin membuat dan mengelola survei dengan berbagai tipe pertanyaan dari mulai dropdown, single choice, checkbox, single text, large text, skala numerik, nomor, rating skala berbagai validasi dan logika, agar saya dapat mengumpulkan data terstruktur dari responden.

#### Kriteria Penerimaan

1. Survey_Builder HARUS mendukung pembuatan, pengeditan, duplikasi, penonaktifan, penghapusan, dan pengarsipan survei.
2. Survey_Builder HARUS mengizinkan pengaturan tanggal-waktu mulai dan tanggal-waktu berakhir untuk setiap survei.
3. DIMANA durasi maksimal per sesi dikonfigurasi, Survey_Builder HARUS memberlakukan timer countdown yang membatasi waktu responden untuk menyelesaikan survei.
4. DIMANA jumlah maksimal responden dikonfigurasi, Survey_Builder HARUS berhenti menerima respons baru setelah batas tercapai.
5. Survey_Builder HARUS mendukung tipe pertanyaan berikut: pilihan ganda (single), checkbox (pilihan multiple), teks pendek, teks panjang (essay), nomor telepon, skala numerik, dropdown, matrix/Likert, upload file/foto, dan tanggal & waktu dengan berbagai validasi pertanyaan dan ketentuan lainnya.
6. Survey_Builder HARUS mendukung aturan validasi field termasuk: wajib diisi, panjang karakter minimum/maksimum, format email, format nomor HP Indonesia, rentang numerik, pola regex kustom, dan maksimum pilihan checkbox.
7. Survey_Builder HARUS mendukung skip logic yang melewatkan pertanyaan berdasarkan jawaban sebelumnya.
8. Survey_Builder HARUS mendukung logika show/hide kondisional yang menampilkan atau menyembunyikan pertanyaan berdasarkan jawaban sebelumnya.
9. Survey_Builder HARUS mendukung percabangan halaman yang mengarahkan responden ke halaman survei berbeda berdasarkan jawaban.
10. DIMANA opsi acak urutan diaktifkan untuk pertanyaan, Survey_Builder HARUS menampilkan opsi jawaban dalam urutan acak ke setiap responden.
11. DIMANA opsi lainnya diaktifkan untuk pertanyaan, Survey_Builder HARUS menampilkan opsi jawaban lainnya ke setiap responden agar mengisi sendiri.

### Kebutuhan 7: Satu Respons Per Survei

**User Story:** Sebagai admin, saya ingin setiap responden dibatasi satu respons per survei, agar integritas data terjaga dan pengiriman duplikat dicegah.

#### Kriteria Penerimaan

1. KETIKA responden mencoba mengirim respons ke survei yang sudah mereka selesaikan, Manajer_Respons HARUS menolak pengiriman dan menginformasikan responden bahwa mereka sudah merespons.
2. Manajer_Respons HARUS memberlakukan constraint unik pada kombinasi identifier responden dan identifier survei.
3. SELAMA responden memiliki respons yang sedang berlangsung untuk suatu survei, Manajer_Respons HARUS mengizinkan responden melanjutkan respons tersebut daripada memulai yang baru.

### Kebutuhan 8: Manajemen dan Filter Respons

**User Story:** Sebagai admin, saya ingin melihat dan memfilter respons survei, agar saya dapat menganalisis data berdasarkan berbagai kriteria.

#### Kriteria Penerimaan

1. Manajer_Respons HARUS menampilkan semua respons yang terkumpul untuk survei yang dipilih.
2. Manajer_Respons HARUS mendukung filter respons berdasarkan rentang tanggal, wilayah/geolokasi, atribut profil responden, status penyelesaian, tipe perangkat, survei tertentu, dan tag kustom.
3. KETIKA filter diterapkan, Manajer_Respons HARUS menampilkan hanya respons yang cocok dengan semua kriteria filter yang dipilih.

### Kebutuhan 9: Export Data

**User Story:** Sebagai admin atau analis, saya ingin mengexport data survei dalam berbagai format, agar saya dapat melakukan analisis dan pelaporan eksternal.

#### Kriteria Penerimaan

1. Modul_Export HARUS mendukung export data dalam format CSV yang berisi data respons mentah.
2. Modul_Export HARUS mendukung export data dalam format Excel yang berisi data respons dan statistik ringkasan.
3. Modul_Export HARUS mendukung export data dalam format PDF yang berisi laporan visual dengan chart.
4. Modul_Export HARUS mendukung export data dalam format JSON yang berisi data respons terstruktur.
5. KETIKA export diminta, Modul_Export HARUS menerapkan filter aktif untuk membatasi set data yang diexport.
6. KETIKA export selesai, Modul_Export HARUS menandai respons yang diexport dengan timestamp export.

### Kebutuhan 10: Audit Log

**User Story:** Sebagai super admin, saya ingin semua aktivitas sistem dicatat dalam audit log, agar saya dapat menelusuri tindakan untuk keamanan dan kepatuhan.

#### Kriteria Penerimaan

1. Audit_Logger HARUS mencatat event berikut: login/logout, operasi CRUD survei, perubahan pertanyaan, notifikasi email terkirim, export data, perubahan peran, operasi pembersihan data, dan penukaran reward.
2. Audit_Logger HARUS menyimpan untuk setiap event: pengguna yang bertindak, tipe aksi, timestamp, modul yang terpengaruh, dan alamat IP sumber.
3. Audit_Logger HARUS mendukung filter entri log berdasarkan pengguna, tipe aksi, rentang tanggal, modul, dan alamat IP.
4. Audit_Logger HARUS mendukung export entri log yang difilter dalam format CSV.
5. Audit_Logger HARUS menyimpan entri log selama minimal 12 bulan.

### Kebutuhan 11: Manajemen Pengguna dan Kontrol Akses Berbasis Peran

**User Story:** Sebagai super admin, saya ingin mengelola akun pengguna dan menetapkan peran, agar setiap pengguna memiliki akses yang sesuai ke fitur sistem.

#### Kriteria Penerimaan

1. Manajer_Pengguna HARUS mendukung peran berikut: Super_Admin, Admin, Analis, Viewer, dan Responden.
2. Manajer_Pengguna HARUS mengizinkan pengguna Super_Admin untuk menambah pengguna baru, mengubah peran pengguna, mengaktifkan/menonaktifkan akun, mereset kata sandi, dan melihat riwayat aktivitas pengguna.
3. Manajer_Pengguna HARUS mengizinkan import massal pengguna melalui upload file CSV.
4. SELAMA akun pengguna dinonaktifkan, Sistem HARUS menolak percobaan login untuk akun tersebut.
5. Manajer_Pengguna HARUS membatasi pembuatan dan pengeditan survei hanya untuk pengguna dengan peran Admin atau Super_Admin.
6. Manajer_Pengguna HARUS membatasi export data hanya untuk pengguna dengan peran Admin, Analis, atau Super_Admin.
7. Manajer_Pengguna HARUS membatasi operasi pembersihan data hanya untuk pengguna dengan peran Admin atau Super_Admin.

### Kebutuhan 12: Pembersihan Data

**User Story:** Sebagai admin, saya ingin melakukan penghapusan data terkontrol, agar saya dapat mengelola penyimpanan sambil menjaga integritas data dan kepatuhan.

#### Kriteria Penerimaan

1. Modul_Pembersihan_Data HARUS mengizinkan penghapusan respons survei tertentu hanya setelah respons tersebut ditandai sudah diexport.
2. JIKA penghapusan diminta untuk respons yang belum diexport, MAKA Modul_Pembersihan_Data HARUS menolak permintaan dan menampilkan pesan yang menunjukkan data harus diexport terlebih dahulu.
3. Modul_Pembersihan_Data HARUS mendukung filter data yang dapat dihapus berdasarkan survei, rentang tanggal, status export, dan status survei.
4. Modul_Pembersihan_Data HARUS mendukung pengarsipan survei tidak aktif.
5. Modul_Pembersihan_Data HARUS mendukung penghapusan data pribadi responden untuk kepatuhan GDPR.
6. KETIKA penghapusan data responden diminta, Modul_Pembersihan_Data HARUS memerlukan persetujuan Super_Admin sebelum eksekusi.
7. Modul_Pembersihan_Data HARUS memerlukan konfirmasi ganda (pengakuan dua langkah) sebelum mengeksekusi operasi penghapusan apapun.
8. KETIKA operasi penghapusan dieksekusi, Audit_Logger HARUS mencatat detail penghapusan termasuk pengguna yang bertindak, record yang terpengaruh, dan timestamp.
9. DIMANA purge terjadwal dikonfigurasi, Modul_Pembersihan_Data HARUS secara otomatis menghapus data yang sudah diexport yang lebih lama dari periode retensi yang dikonfigurasi.

### Kebutuhan 13: Poin Reward - Perolehan

**User Story:** Sebagai responden, saya ingin mendapatkan poin dari mengisi survei dan berinteraksi dengan platform, agar saya dapat menukarkan reward.

#### Kriteria Penerimaan

1. KETIKA responden menyelesaikan registrasi, Mesin_Reward HARUS mengkreditkan 500 poin ke saldo responden.
2. KETIKA responden melengkapi profil mereka, Mesin_Reward HARUS mengkreditkan 250 poin ke saldo responden.
3. KETIKA responden menyelesaikan survei pendek (estimasi durasi kurang dari 5 menit), Mesin_Reward HARUS mengkreditkan antara 1.000 hingga 3.000 poin sesuai konfigurasi survei tersebut.
4. KETIKA responden menyelesaikan survei panjang (estimasi durasi lebih dari 10 menit), Mesin_Reward HARUS mengkreditkan antara 5.000 hingga 15.000 poin sesuai konfigurasi survei tersebut.
5. SELAMA responden mempertahankan streak penyelesaian 7 hari berturut-turut, Mesin_Reward HARUS menerapkan multiplier 1,5x pada poin yang diperoleh.
6. SELAMA responden mempertahankan streak penyelesaian 30 hari berturut-turut, Mesin_Reward HARUS menerapkan multiplier 2,0x pada poin yang diperoleh.
7. Mesin_Reward HARUS mengkreditkan poin hanya untuk pengiriman survei yang selesai sepenuhnya.
8. KETIKA admin secara manual menetapkan poin ke responden, Mesin_Reward HARUS mengkreditkan jumlah yang ditentukan ke saldo responden.

### Kebutuhan 14: Poin Reward - Aturan dan Kadaluarsa

**User Story:** Sebagai operator sistem, saya ingin poin reward diatur oleh aturan yang jelas, agar sistem reward tetap adil dan berkelanjutan.

#### Kriteria Penerimaan

1. Mesin_Reward HARUS mengkadaluarsakan poin yang tidak digunakan setelah 12 bulan dari tanggal perolehan.
2. Mesin_Reward HARUS memberlakukan bahwa poin tidak dapat dipindahkan antar akun responden.
3. Mesin_Reward HARUS memberlakukan aturan satu-respons-per-survei dengan memberikan poin hanya untuk pengiriman pertama yang selesai per survei per responden.
4. Mesin_Reward HARUS mempertahankan threshold minimum penukaran sebesar 10.000 poin.

### Kebutuhan 15: Poin Reward - Penukaran

**User Story:** Sebagai responden, saya ingin menukarkan poin saya dengan pulsa telepon, paket data, voucher, atau transfer e-wallet, agar saya mendapat reward nyata atas partisipasi saya.

#### Kriteria Penerimaan

1. Mesin_Reward HARUS mengizinkan responden melihat saldo poin mereka saat ini.
2. Mesin_Reward HARUS menawarkan kategori reward berikut: pulsa telepon (Rp 5.000 hingga Rp 100.000), paket data (1GB hingga 20GB), voucher belanja (Rp 10.000 hingga Rp 200.000), dan transfer e-wallet (Rp 10.000 hingga Rp 500.000).
3. KETIKA responden memulai penukaran, Mesin_Reward HARUS menampilkan reward yang tersedia, meminta nomor tujuan atau akun, dan memerlukan konfirmasi OTP.
4. KETIKA konfirmasi OTP berhasil, Mesin_Reward HARUS memotong poin yang sesuai dari saldo responden dan memulai pemrosesan reward.
5. JIKA saldo poin responden di bawah jumlah yang diperlukan untuk reward yang dipilih, MAKA Mesin_Reward HARUS menolak penukaran dan menampilkan saldo tidak mencukupi.
6. KETIKA pemrosesan reward berhasil diselesaikan, Layanan_Notifikasi HARUS mengirim email konfirmasi penukaran ke responden.
7. KETIKA penukaran diproses, Audit_Logger HARUS mencatat detail penukaran termasuk responden, tipe reward, jumlah poin, dan timestamp.

### Kebutuhan 16: Reward Manual - Survei Cepat

**User Story:** Sebagai admin, saya ingin membuat survei cepat dengan mode reward manual, agar saya dapat mengumpulkan data nomor telepon/akun responden dan mengisi reward (pulsa, paket data, e-wallet) secara manual setelah survei selesai.

#### Kriteria Penerimaan

1. Survey_Builder HARUS mendukung mode reward dengan dua pilihan: "Otomatis (Poin)" dan "Manual (Survei Cepat)".
2. KETIKA admin memilih mode "Manual (Survei Cepat)", Survey_Builder HARUS menampilkan konfigurasi khusus yang meminta jenis reward yang dijanjikan (pulsa, paket data, e-wallet) dan nominal reward.
3. KETIKA survei dengan mode reward manual aktif, Sistem HARUS menampilkan informasi reward yang dijanjikan kepada responden sebelum mereka mulai mengisi survei.
4. Sistem HARUS menyediakan field wajib bagi responden untuk memasukkan nomor telepon atau akun e-wallet tujuan reward pada survei dengan mode manual.
5. KETIKA survei dengan mode manual selesai (deadline tercapai atau ditutup admin), Modul_Export HARUS menyediakan fitur extract data yang mencakup nama responden, nomor telepon/akun tujuan, dan status pengisian.
6. Manajer_Respons HARUS menampilkan daftar responden yang berhak menerima reward manual beserta nomor tujuan mereka dalam panel khusus "Distribusi Reward Manual".
7. KETIKA admin menandai reward manual sebagai sudah dikirim untuk responden tertentu, Sistem HARUS memperbarui status distribusi menjadi "Terkirim" dan mencatat timestamp pengiriman.
8. Sistem HARUS mendukung penandaan status distribusi reward manual secara massal (bulk) untuk beberapa responden sekaligus.
9. KETIKA status distribusi reward manual diperbarui, Audit_Logger HARUS mencatat detail perubahan termasuk admin yang bertindak, responden yang terpengaruh, dan timestamp.
10. JIKA responden belum menyelesaikan survei dengan mode manual sepenuhnya, MAKA responden tersebut HARUS TIDAK muncul dalam daftar penerima reward manual.

### Kebutuhan 17: Geolokasi

**User Story:** Sebagai admin, saya ingin data geografis responden dikumpulkan dan divisualisasikan, agar saya dapat menganalisis respons survei berdasarkan wilayah dan menargetkan survei secara geografis.

#### Kriteria Penerimaan

1. KETIKA responden memberikan izin lokasi, Layanan_Geolokasi HARUS mengumpulkan koordinat GPS dan menentukan kota/provinsi melalui reverse geocoding.
2. JIKA responden menolak izin lokasi, MAKA Layanan_Geolokasi HARUS mengizinkan pengisian manual data lokasi.
3. Layanan_Geolokasi HARUS menyimpan data lokasi dalam bentuk terenkripsi.
4. Layanan_Geolokasi HARUS menyediakan data lokasi untuk filter respons berdasarkan wilayah, visualisasi heat map, dan laporan distribusi geografis.
5. Layanan_Geolokasi HARUS TIDAK menampilkan koordinat GPS ke pengguna lain atau responden.

### Kebutuhan 18: Kontrol Waktu Survei

**User Story:** Sebagai admin, saya ingin mengontrol ketersediaan survei dan durasi sesi, agar pengumpulan data terjadi dalam batas waktu yang ditentukan.

#### Kriteria Penerimaan

1. KETIKA tanggal-waktu saat ini sebelum tanggal-waktu mulai survei yang dikonfigurasi, Sistem HARUS TIDAK mengizinkan responden mengakses survei.
2. KETIKA tanggal-waktu saat ini setelah tanggal-waktu berakhir survei yang dikonfigurasi, Sistem HARUS TIDAK menerima respons survei baru.
3. DIMANA durasi sesi maksimal dikonfigurasi, Sistem HARUS menampilkan timer countdown dan otomatis mengirim respons ketika waktu habis.
4. DIMANA jumlah maksimal responden dikonfigurasi, Sistem HARUS menolak percobaan respons baru setelah batas yang dikonfigurasi tercapai.