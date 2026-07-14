/**
 * Halaman legal PUBLIK — dapat dibuka TANPA login.
 *
 * Google Play mewajibkan URL publik yang bisa dibuka reviewer tanpa akun untuk:
 *   - Kebijakan Privasi   → /kebijakan-privasi
 *   - Penghapusan Akun    → /penghapusan-akun
 * (Syarat & Ketentuan disertakan sebagai pelengkap → /syarat-ketentuan.)
 *
 * Versi ringkas dari halaman ini juga tampil di dalam aplikasi (menu Profil),
 * lihat pages/admin/profile/LegalPages.tsx. Bila mengubah isi di sini, samakan
 * juga di sana dan di docs/play-store/*.md.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** Tanggal perubahan terakhir isi dokumen legal (perbarui manual bila isi diubah). */
const TERAKHIR_DIPERBARUI = '14 Juli 2026';

const EMAIL = 'info@populicenter.org';
const WHATSAPP = '0812-9206-8362';

function LegalShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-indigo-500 to-indigo-700 px-6 py-8 text-white">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm font-medium text-indigo-100">Populi Center · Survei Online</p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{title}</h1>
          <p className="mt-2 text-xs text-indigo-200">
            Terakhir diperbarui: {TERAKHIR_DIPERBARUI}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <article className="space-y-6 rounded-2xl border border-gray-200 bg-white p-6 text-sm leading-relaxed text-gray-700 shadow-sm sm:p-8">
          {children}
        </article>

        <nav className="mt-8 flex flex-wrap gap-x-4 gap-y-2 text-sm text-indigo-700">
          <Link className="hover:underline" to="/kebijakan-privasi">
            Kebijakan Privasi
          </Link>
          <Link className="hover:underline" to="/penghapusan-akun">
            Penghapusan Akun
          </Link>
          <Link className="hover:underline" to="/syarat-ketentuan">
            Syarat &amp; Ketentuan
          </Link>
          <Link className="hover:underline" to="/login">
            Masuk ke aplikasi
          </Link>
        </nav>
      </main>

      <footer className="border-t border-gray-200 bg-white px-6 py-6 text-center text-xs text-gray-500">
        © {new Date().getFullYear()} Populi Center. Semua hak dilindungi.
      </footer>
    </div>
  );
}

function H2({ children }: { children: ReactNode }) {
  return <h2 className="text-base font-semibold text-gray-900">{children}</h2>;
}

function Ul({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1 pl-5">{children}</ul>;
}

/** /kebijakan-privasi */
export function PublicPrivacyPolicyPage() {
  return (
    <LegalShell title="Kebijakan Privasi">
      <p>
        Aplikasi <strong>Riset Populi Center</strong> (&quot;Aplikasi&quot;) dikelola oleh{' '}
        <strong>Populi Center</strong> (&quot;kami&quot;). Kebijakan ini menjelaskan data apa yang
        kami kumpulkan, bagaimana digunakan, dibagikan, disimpan, dan cara Anda menghapusnya.
      </p>

      <section className="space-y-3">
        <H2>1. Data yang kami kumpulkan</H2>
        <p className="font-medium text-gray-800">Data akun &amp; profil (Anda berikan saat daftar):</p>
        <Ul>
          <li>Nama lengkap, alamat email, nomor telepon</li>
          <li>Tanggal lahir, jenis kelamin, pendidikan, pekerjaan, agama</li>
          <li>Wilayah (provinsi/kota/kecamatan)</li>
          <li>Foto profil (avatar) — opsional, bila Anda mengunggah</li>
        </Ul>

        <p className="font-medium text-gray-800">Data saat mengisi survei:</p>
        <Ul>
          <li>
            Jawaban survei (termasuk foto, rekaman audio, tanda tangan, atau berkas yang Anda unggah
            bila pertanyaannya meminta)
          </li>
          <li>
            Lokasi GPS — <strong>hanya</strong> bila survei mengaktifkan perekaman lokasi, dan hanya
            saat Anda mengisi survei (tidak di latar belakang)
          </li>
          <li>Jenis perangkat (mobile/desktop)</li>
        </Ul>

        <p className="font-medium text-gray-800">Data reward:</p>
        <Ul>
          <li>Saldo poin &amp; riwayat transaksi poin</li>
          <li>Nomor tujuan (nomor HP/akun e-wallet) yang Anda masukkan untuk penukaran</li>
        </Ul>

        <p className="font-medium text-gray-800">Data teknis:</p>
        <Ul>
          <li>Token notifikasi (FCM) untuk mengirim pemberitahuan</li>
          <li>Alamat IP &amp; waktu untuk catatan keamanan (audit log)</li>
        </Ul>
      </section>

      <section className="space-y-3">
        <H2>2. Tujuan penggunaan</H2>
        <Ul>
          <li>Menyediakan dan menjalankan layanan survei serta program poin/reward</li>
          <li>Menyaring kelayakan responden &amp; mencegah pengisian ganda</li>
          <li>Mengirim notifikasi terkait survei, poin, dan penukaran reward</li>
          <li>Memproses penukaran poin menjadi pulsa/e-wallet</li>
          <li>Keamanan, pencegahan penyalahgunaan, dan kepatuhan hukum</li>
        </Ul>
        <p>
          Kami <strong>tidak menjual</strong> data pribadi Anda.
        </p>
      </section>

      <section className="space-y-3">
        <H2>3. Berbagi data dengan pihak ketiga</H2>
        <p>Kami membagikan data terbatas hanya seperlunya kepada penyedia layanan:</p>
        <Ul>
          <li>
            <strong>Google Firebase Cloud Messaging</strong> — pengiriman notifikasi (token
            perangkat)
          </li>
          <li>
            <strong>Google Sign-In</strong> — bila Anda masuk dengan akun Google (verifikasi
            identitas)
          </li>
          <li>
            <strong>Penyedia PPOB</strong> — memproses penukaran pulsa/e-wallet (nomor tujuan)
          </li>
          <li>
            <strong>Penyedia email</strong> — pengiriman email (mis. kode OTP/verifikasi)
          </li>
        </Ul>
        <p>
          Data disimpan di server kami sendiri dan layanan penyimpanan berkas internal. Transmisi
          data dienkripsi melalui HTTPS.
        </p>
      </section>

      <section className="space-y-3">
        <H2>4. Penyimpanan &amp; retensi</H2>
        <p>
          Data disimpan selama akun Anda aktif. Saat Anda menghapus akun, data pribadi dan data
          terkait (profil, jawaban survei, saldo poin) dihapus permanen. Sebagian catatan
          keamanan/keuangan dapat disimpan terbatas sesuai kewajiban hukum.
        </p>
      </section>

      <section className="space-y-3">
        <H2>5. Hak Anda &amp; penghapusan akun</H2>
        <p>
          Anda dapat mengakses dan memperbarui data di menu <strong>Profil</strong>. Anda dapat
          menghapus akun kapan saja — lihat{' '}
          <Link className="text-indigo-700 underline" to="/penghapusan-akun">
            halaman Penghapusan Akun
          </Link>
          .
        </p>
      </section>

      <section className="space-y-3">
        <H2>6. Anak-anak</H2>
        <p>
          Aplikasi ditujukan untuk pengguna berusia 17 tahun ke atas. Kami tidak sengaja mengumpulkan
          data anak di bawah usia tersebut.
        </p>
      </section>

      <section className="space-y-3">
        <H2>7. Perubahan kebijakan</H2>
        <p>
          Kami dapat memperbarui kebijakan ini. Perubahan material akan diberitahukan melalui
          aplikasi atau email.
        </p>
      </section>

      <section className="space-y-3">
        <H2>8. Kontak</H2>
        <Ul>
          <li>
            Email: <strong>{EMAIL}</strong>
          </li>
          <li>
            WhatsApp: <strong>{WHATSAPP}</strong>
          </li>
        </Ul>
      </section>
    </LegalShell>
  );
}

/** /penghapusan-akun */
export function PublicAccountDeletionPage() {
  return (
    <LegalShell title="Cara Menghapus Akun">
      <p>
        Halaman ini menjelaskan cara menghapus akun <strong>Riset Populi Center</strong> beserta data
        yang terkait dengannya.
      </p>

      <section className="space-y-3">
        <H2>Menghapus akun lewat aplikasi (paling cepat)</H2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Buka aplikasi <strong>Riset Populi Center</strong> dan masuk.
          </li>
          <li>
            Ketuk tab <strong>Profil</strong>.
          </li>
          <li>
            Gulir ke bagian <strong>Hapus Akun</strong>.
          </li>
          <li>
            Ketuk <strong>Hapus akun saya</strong>, lalu konfirmasi.
          </li>
        </ol>
        <p>
          Akun Anda dan seluruh data terkait akan <strong>langsung dihapus permanen</strong>.
        </p>
      </section>

      <section className="space-y-3">
        <H2>Menghapus akun tanpa aplikasi</H2>
        <p>
          Kirim email ke <strong>{EMAIL}</strong> dari alamat email yang terdaftar, dengan subjek{' '}
          <strong>&quot;Hapus Akun&quot;</strong>. Permintaan diproses maksimal <strong>30 hari</strong>.
        </p>
      </section>

      <section className="space-y-3">
        <H2>Data yang dihapus</H2>
        <Ul>
          <li>Profil (nama, email, telepon, tanggal lahir, jenis kelamin, wilayah, foto)</li>
          <li>Seluruh jawaban survei (termasuk berkas/foto/audio yang diunggah)</li>
          <li>Saldo poin dan riwayat transaksi poin</li>
          <li>Token notifikasi perangkat</li>
        </Ul>
      </section>

      <section className="space-y-3">
        <H2>Data yang mungkin disimpan terbatas</H2>
        <p>
          Sebagian catatan keamanan/keuangan (mis. log audit, catatan transaksi penukaran yang sudah
          terjadi) dapat disimpan terbatas untuk memenuhi kewajiban hukum dan mencegah
          penyalahgunaan. Catatan ini tidak digunakan untuk menghubungi Anda.
        </p>
      </section>

      <section className="space-y-3">
        <H2>Catatan</H2>
        <Ul>
          <li>
            <strong>Poin yang belum ditukar akan hangus</strong> saat akun dihapus.
          </li>
          <li>
            Akun yang pernah dipakai membuat survei (peran admin/peneliti) tidak dapat dihapus
            mandiri — hubungi admin terlebih dahulu.
          </li>
        </Ul>
      </section>

      <section className="space-y-3">
        <H2>Kontak</H2>
        <p>
          Email <strong>{EMAIL}</strong> · WhatsApp <strong>{WHATSAPP}</strong>
        </p>
      </section>
    </LegalShell>
  );
}

/** /syarat-ketentuan */
export function PublicTermsPage() {
  return (
    <LegalShell title="Syarat & Ketentuan">
      <p>
        Dengan menggunakan aplikasi ini, Anda setuju mengisi survei dengan jujur dan data yang benar.
        Satu orang hanya boleh memiliki satu akun.
      </p>
      <p>
        Poin diberikan atas survei yang diselesaikan sesuai ketentuan tiap survei, dan dapat ditukar
        menjadi pulsa/e-wallet. Poin <strong>tidak dapat diuangkan secara tunai</strong>, dapat
        kedaluwarsa, dan akan hangus bila akun dihapus.
      </p>
      <p>
        Poin merupakan bentuk apresiasi atas partisipasi mengisi survei — bukan permainan berhadiah,
        undian, maupun perjudian.
      </p>
      <p>
        Kecurangan (jawaban asal, akun ganda, manipulasi) dapat mengakibatkan poin dibatalkan dan
        akun dinonaktifkan. Kami dapat memperbarui ketentuan ini sewaktu-waktu.
      </p>
      <p>
        Kontak: <strong>{EMAIL}</strong> · WhatsApp <strong>{WHATSAPP}</strong>
      </p>
    </LegalShell>
  );
}
