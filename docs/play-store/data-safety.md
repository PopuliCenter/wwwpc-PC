# Form Data Safety (Play Console) — jawaban acuan

Acuan pengisian **Play Console → App content → Data safety**. Sesuaikan bila ada
perubahan fitur. Prinsip umum:

- **Encrypted in transit:** YA (semua via HTTPS).
- **Users can request data deletion:** YA (in-app + email; lihat penghapusan-akun.md).
- **Data dipakai untuk tracking iklan / dibagikan ke broker:** TIDAK.

## Apakah aplikasi mengumpulkan/membagikan data? → YA, mengumpulkan

| Jenis data                                             | Dikumpulkan | Dibagikan                            | Wajib?   | Tujuan                                                         |
| ------------------------------------------------------ | ----------- | ------------------------------------ | -------- | -------------------------------------------------------------- |
| Nama                                                   | Ya          | Tidak                                | Wajib    | Fungsi aplikasi, manajemen akun                                |
| Email                                                  | Ya          | Tidak                                | Wajib    | Fungsi aplikasi, manajemen akun, verifikasi                    |
| Nomor telepon                                          | Ya          | Ya (ke penyedia PPOB saat penukaran) | Opsional | Fungsi aplikasi, penukaran reward                              |
| Alamat (wilayah prov/kota/kec)                         | Ya          | Tidak                                | Opsional | Personalisasi/penyaringan survei                               |
| Tanggal lahir/jenis kelamin/pendidikan/pekerjaan/agama | Ya          | Tidak                                | Opsional | Penyaringan kelayakan survei (riset)                           |
| Lokasi (GPS) — perkiraan & presisi                     | Ya          | Tidak                                | Opsional | Hanya saat survei yg mengaktifkan lokasi; bukan latar belakang |
| Foto (avatar & jawaban survei)                         | Ya          | Tidak                                | Opsional | Fungsi aplikasi (jawaban/profil)                               |
| Audio (jawaban survei)                                 | Ya          | Tidak                                | Opsional | Fungsi aplikasi (jawaban)                                      |
| Berkas/dokumen (unggahan jawaban)                      | Ya          | Tidak                                | Opsional | Fungsi aplikasi (jawaban)                                      |
| ID pengguna                                            | Ya          | Tidak                                | Wajib    | Fungsi aplikasi, keamanan                                      |
| Token perangkat (FCM)                                  | Ya          | Ya (Google FCM)                      | —        | Notifikasi                                                     |
| Riwayat poin / transaksi reward                        | Ya          | Sebagian (nomor tujuan ke PPOB)      | Opsional | Program reward                                                 |
| Log/diagnostik (IP, waktu)                             | Ya          | Tidak                                | —        | Keamanan, pencegahan penyalahgunaan                            |

## Tujuan (purposes) yang dicentang

- App functionality
- Account management
- (Reward) — masuk kategori App functionality
- Fraud prevention, security, and compliance

JANGAN centang: Advertising/marketing, Analytics pihak ketiga untuk iklan,
Personalization untuk iklan.

## Catatan deklarasi izin sensitif

- **Lokasi:** hanya foreground (tidak ada `ACCESS_BACKGROUND_LOCATION`). Jelaskan
  bahwa lokasi dipakai saat responden mengisi survei tertentu.
- **Mikrofon (RECORD_AUDIO):** untuk pertanyaan tipe audio.
- **Notifikasi (POST_NOTIFICATIONS):** pemberitahuan survei/poin/reward.
