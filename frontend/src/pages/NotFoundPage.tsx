import { useNavigate } from 'react-router-dom';

/**
 * Halaman 404 ramah — menggantikan error bawaan React Router saat rute tidak
 * ditemukan (mis. notifikasi dengan link yang tidak cocok). Memberi jalan
 * kembali ke beranda alih-alih layar "Unexpected Application Error".
 */
export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface p-6 text-center">
      <img
        src="/logo-populi-center.png"
        alt="Populi Center"
        className="h-16 w-16 object-contain opacity-90"
      />
      <h1 className="text-2xl font-bold text-gray-900">Halaman tidak ditemukan</h1>
      <p className="max-w-xs text-sm text-gray-500">
        Tautan yang Anda buka tidak tersedia atau sudah berpindah.
      </p>
      <button
        type="button"
        onClick={() => navigate('/', { replace: true })}
        className="mt-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700"
      >
        Kembali ke Beranda
      </button>
    </div>
  );
}
