import { Outlet, Navigate, Link } from 'react-router-dom';
import { Suspense } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { isEmbedMode } from '@/utils/embed';
import { Logo } from '@/components/common/Logo';
import { PageLoader } from '@/components/common/PageLoader';
import { NativeBackGuard } from '@/components/common/NativeBackGuard';

const legalLinkCls = 'inline-flex min-h-11 items-center text-gray-600 underline lg:min-h-0';

export function AuthLayout() {
  const { isAuthenticated, user, isLoading } = useAuthStore();

  if (isLoading) {
    // Di mode embed hindari min-h-screen (100vh) agar iframe tidak overshoot.
    return (
      <div className={`mx-auto w-full max-w-[400px] p-4 ${isEmbedMode ? '' : 'pt-16'}`}>
        <PageLoader className={isEmbedMode ? 'min-h-[160px]' : 'min-h-screen'} />
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
        <div className="w-full max-w-[400px]">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen grid-rows-1 lg:grid-cols-[5fr_7fr]">
      {/* Back Android: di /login langsung keluar aplikasi. */}
      <NativeBackGuard />
      {/* Panel sampul laporan — hanya desktop; warna rata tanpa gradien atau ikon. */}
      <div className="hidden bg-cover-token p-10 lg:flex lg:flex-col lg:justify-between xl:p-12">
        <div className="flex items-center gap-3">
          <Logo size={48} />
          <p className="text-sm font-semibold text-white">Populi Center</p>
        </div>

        {/* Bukan <h1>: judul halaman ada di form (Masuk/Daftar/Lupa kata sandi). */}
        <p className="max-w-md font-serif text-[40px] font-semibold leading-[46px] tracking-tight text-white [font-synthesis:none]">
          Pendapat Anda menjadi data penelitian.
        </p>

        <div>
          <dl className="text-xs">
            <div className="flex justify-between gap-6 border-t border-cover-line py-2.5">
              <dt className="text-cover-muted">Penyelenggara</dt>
              <dd className="text-right text-cover-fg">Populi Center</dd>
            </div>
            <div className="flex justify-between gap-6 border-t border-cover-line py-2.5">
              <dt className="text-cover-muted">Poin</dt>
              <dd className="text-right text-cover-fg">Dapat ditukar pulsa atau saldo e-wallet</dd>
            </div>
            <div className="flex justify-between gap-6 border-t border-cover-line py-2.5">
              <dt className="text-cover-muted">Data pribadi</dt>
              <dd className="text-right">
                <Link
                  to="/kebijakan-privasi"
                  // Outline fokus global (primary-500) tidak terbaca di atas sampul.
                  className="text-cover-fg underline decoration-cover-muted underline-offset-2 hover:text-white focus-visible:outline-white"
                >
                  Kebijakan Privasi
                </Link>
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-white/60">
            © {new Date().getFullYear()} Populi Center. Seluruh hak cipta dilindungi.
          </p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-col bg-panel">
        <div className="flex flex-1 flex-col justify-center px-4 py-10 sm:px-6 lg:px-16 xl:px-24">
          <div className="mx-auto w-full max-w-[400px] lg:mx-0">
            {/* Identitas di bawah lg saja; desktop sudah punya panel sampul. */}
            <div className="mb-8 flex items-center gap-2.5 lg:hidden">
              <Logo size={40} />
              <span className="text-sm font-semibold text-gray-900">Populi Center</span>
            </div>
            <Suspense fallback={<PageLoader />}>
              <Outlet />
            </Suspense>
          </div>
        </div>
        {/* Footer: tautan legal publik (wajib mudah ditemukan — Play & OAuth Google)
            + hak cipta di mobile (desktop sudah ada di panel brand). */}
        <div className="px-4 pb-6 text-xs sm:px-6 lg:px-16 xl:px-24">
          <div className="mx-auto w-full max-w-[400px] lg:mx-0">
            <nav className="flex flex-wrap items-center gap-x-4" aria-label="Tautan legal">
              <Link className={legalLinkCls} to="/kebijakan-privasi">
                Kebijakan Privasi
              </Link>
              <Link className={legalLinkCls} to="/syarat-ketentuan">
                Syarat &amp; Ketentuan
              </Link>
              <Link className={legalLinkCls} to="/penghapusan-akun">
                Hapus Akun
              </Link>
            </nav>
            <p className="mt-1 text-gray-500 lg:hidden">
              © {new Date().getFullYear()} Populi Center
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
