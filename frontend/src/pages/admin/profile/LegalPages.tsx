/** Sub-layar statis "Kebijakan Privasi" (menu Settings responden). */
export function PrivacyPolicyView() {
  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-6 text-sm leading-relaxed text-gray-600 shadow-sm">
      <h2 className="text-base font-semibold text-gray-900">Kebijakan Privasi</h2>
      <p>
        Kami mengumpulkan data akun (nama, email, telepon), data profil/demografi, jawaban survei
        (termasuk foto/audio/berkas bila diminta), serta lokasi GPS hanya saat survei yang
        mengaktifkannya. Data dipakai untuk menjalankan layanan survei &amp; program poin, mengirim
        notifikasi, dan memproses penukaran reward.
      </p>
      <p>
        Kami tidak menjual data Anda. Data dibagikan terbatas hanya ke penyedia layanan seperlunya
        (notifikasi, login Google, pemrosesan pulsa/e-wallet, pengiriman email). Transmisi data
        dienkripsi via HTTPS.
      </p>
      <p>
        Anda dapat memperbarui data di menu Profil dan menghapus akun kapan saja (Profil → Hapus
        Akun). Pertanyaan: <strong>info@populicenter.org</strong>.
      </p>
      <p className="text-xs text-gray-400">Versi lengkap tersedia di situs resmi Populi Center.</p>
    </div>
  );
}

/** Sub-layar statis "Syarat & Ketentuan" (menu Settings responden). */
export function TermsView() {
  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-6 text-sm leading-relaxed text-gray-600 shadow-sm">
      <h2 className="text-base font-semibold text-gray-900">Syarat &amp; Ketentuan</h2>
      <p>
        Dengan menggunakan aplikasi ini, Anda setuju mengisi survei dengan jujur dan data yang
        benar. Satu orang hanya boleh memiliki satu akun.
      </p>
      <p>
        Poin diberikan atas survei yang diselesaikan sesuai ketentuan tiap survei, dan dapat ditukar
        menjadi pulsa/e-wallet. Poin tidak dapat diuangkan secara tunai, dapat kedaluwarsa, dan akan
        hangus bila akun dihapus.
      </p>
      <p>
        Kecurangan (jawaban asal, akun ganda, manipulasi) dapat mengakibatkan poin dibatalkan dan
        akun dinonaktifkan. Kami dapat memperbarui ketentuan ini sewaktu-waktu.
      </p>
      <p>
        Kontak: <strong>info@populicenter.org</strong> · WhatsApp 0812-9206-8362.
      </p>
    </div>
  );
}
