import { Outlet, Navigate, Link } from 'react-router-dom';
import { Suspense } from 'react';
import { ShieldCheck, Gift, Clock } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { isEmbedMode } from '@/utils/embed';
import { PageLoader } from '@/components/common/PageLoader';
import { NativeBackGuard } from '@/components/common/NativeBackGuard';

const highlights = [
  {
    icon: Gift,
    title: 'Reward tiap survei',
    desc: 'Kumpulkan poin di setiap survei dan tukar jadi pulsa atau saldo e-wallet.',
  },
  {
    icon: ShieldCheck,
    title: 'Privasi terjaga',
    desc: 'Identitas dan lokasi Anda dienkripsi, dipakai hanya untuk riset — tidak dijual.',
  },
  {
    icon: Clock,
    title: 'Cepat & mudah',
    desc: 'Isi kapan saja langsung dari ponsel, hanya butuh beberapa menit.',
  },
];

export function AuthLayout() {
  const { isAuthenticated, user, isLoading } = useAuthStore();

  if (isLoading) {
    // Di mode embed hindari min-h-screen (100vh) agar iframe tidak overshoot.
    return (
      <div
        className={`flex items-center justify-center ${isEmbedMode ? 'min-h-[160px]' : 'min-h-screen'}`}
      >
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-primary-600" />
      </div>
    );
  }

  if (isAuthenticated && user) {
    const redirectPath = user.role === 'admin' ? '/admin/dashboard' : '/surveys';
    return <Navigate to={redirectPath} replace />;
  }

  // Mode embed (Elementor): tanpa panel brand, hanya form, lebar penuh dan
  // mengikuti tinggi konten (header sudah disediakan halaman induk).
  if (isEmbedMode) {
    return (
      <div className="flex w-full items-center justify-center px-4 py-8 sm:px-6">
        <div className="w-full max-w-sm">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen grid-rows-1 lg:grid-cols-2">
      {/* Back Android: di /login langsung keluar aplikasi. */}
      <NativeBackGuard />
      {/* Brand panel — hidden on small screens */}
      <div className="relative hidden overflow-hidden bg-primary-800 lg:flex lg:flex-col lg:justify-between">
        <div className="bg-grain absolute inset-0 opacity-60" />
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 80% at 0% 0%, rgba(255,255,255,0.10), transparent 60%), linear-gradient(160deg, #312e81 0%, #1e1b4b 100%)',
          }}
        />
        <div className="relative z-10 flex items-center gap-3 p-10">
          <img
            src="/logo-populi-center.png"
            alt="Populi Center"
            className="h-14 w-14 object-contain"
          />
          <div className="leading-tight">
            <p className="text-sm font-semibold text-white">Populi Center</p>
            <p className="text-xs text-white/60">Survei Online</p>
          </div>
        </div>

        <div className="relative z-10 px-10">
          <h1 className="max-w-md text-3xl font-bold leading-tight text-white">
            Isi survei, suara Anda dihargai.
          </h1>
          <p className="mt-3 max-w-sm text-sm text-white/70">
            Bagikan pendapat Anda dalam beberapa menit dan kumpulkan reward — data serta privasi
            Anda tetap terlindungi.
          </p>

          <ul className="mt-10 space-y-5">
            {highlights.map(({ icon: Icon, title, desc }) => (
              <li key={title} className="flex items-start gap-3.5">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white ring-1 ring-inset ring-white/15">
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <div>
                  <p className="text-sm font-medium text-white">{title}</p>
                  <p className="text-sm text-white/60">{desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative z-10 p-10 text-xs text-white/50">
          © {new Date().getFullYear()} Populi Center. Seluruh hak cipta dilindungi.
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-col bg-surface">
        <div className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
          <div className="w-full max-w-sm">
            <Suspense fallback={<PageLoader />}>
              <Outlet />
            </Suspense>
          </div>
        </div>
        {/* Footer: tautan legal publik (wajib mudah ditemukan — Play & OAuth Google)
            + logo/hak cipta di mobile (desktop sudah ada di panel brand). */}
        <div className="flex flex-col items-center gap-2 pb-6 text-xs text-gray-400">
          <nav className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <Link className="hover:text-gray-600 hover:underline" to="/kebijakan-privasi">
              Kebijakan Privasi
            </Link>
            <span aria-hidden>·</span>
            <Link className="hover:text-gray-600 hover:underline" to="/syarat-ketentuan">
              Syarat &amp; Ketentuan
            </Link>
            <span aria-hidden>·</span>
            <Link className="hover:text-gray-600 hover:underline" to="/penghapusan-akun">
              Hapus Akun
            </Link>
          </nav>
          <div className="flex items-center justify-center gap-2 lg:hidden">
            <img
              src="/logo-populi-center.png"
              alt="Populi Center"
              className="h-4 w-4 object-contain opacity-70"
            />
            <span>© {new Date().getFullYear()} Populi Center</span>
          </div>
        </div>
      </div>
    </div>
  );
}
