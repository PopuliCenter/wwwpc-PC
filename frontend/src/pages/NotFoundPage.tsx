import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/common/Button';
import { Logo } from '@/components/common/Logo';

/**
 * Halaman 404 ramah — menggantikan error bawaan React Router saat rute tidak
 * ditemukan (mis. notifikasi dengan link yang tidak cocok). Memberi jalan
 * kembali ke beranda alih-alih layar "Unexpected Application Error".
 * Latar putih karena logo tidak cukup kontras di atas surface.
 */
export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white p-6 text-center">
      <Logo size={64} />
      <h1 className="text-2xl">Halaman tidak ditemukan</h1>
      <p className="max-w-xs text-sm text-gray-600">
        Tautan yang Anda buka tidak tersedia atau sudah berpindah.
      </p>
      <Button type="button" className="mt-2" onClick={() => navigate('/', { replace: true })}>
        Kembali ke beranda
      </Button>
    </div>
  );
}
