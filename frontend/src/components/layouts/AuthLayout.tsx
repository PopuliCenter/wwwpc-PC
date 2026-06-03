import { Outlet, Navigate } from 'react-router-dom';
import { ShieldCheck, BarChart3, Gift } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';

const highlights = [
  { icon: BarChart3, title: 'Analitik real-time', desc: 'Pantau respons & demografi dalam satu dashboard.' },
  { icon: ShieldCheck, title: 'Data aman', desc: 'Enkripsi, audit log, dan kontrol akses berbasis peran.' },
  { icon: Gift, title: 'Reward responden', desc: 'Sistem poin & penukaran untuk menjaga partisipasi.' },
];

export function AuthLayout() {
  const { isAuthenticated, user, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-primary-600" />
      </div>
    );
  }

  if (isAuthenticated && user) {
    const redirectPath = user.role === 'admin' ? '/admin/dashboard' : '/surveys';
    return <Navigate to={redirectPath} replace />;
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel — hidden on small screens */}
      <div className="relative hidden overflow-hidden bg-primary-800 lg:flex lg:flex-col lg:justify-between">
        <div className="bg-grain absolute inset-0 opacity-60" />
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 80% at 0% 0%, rgba(255,255,255,0.10), transparent 60%), linear-gradient(160deg, #7a1f1d 0%, #4a1413 100%)',
          }}
        />
        <div className="relative z-10 flex items-center gap-3 p-10">
          <img
            src="/populi-center.png"
            alt="Populi Center"
            className="h-10 w-10 rounded-lg bg-white/90 p-1"
          />
          <div className="leading-tight">
            <p className="text-sm font-semibold text-white">Populi Center</p>
            <p className="text-xs text-white/60">Survei Online</p>
          </div>
        </div>

        <div className="relative z-10 px-10">
          <h1 className="max-w-md text-3xl font-bold leading-tight text-white">
            Platform survei untuk keputusan berbasis data.
          </h1>
          <p className="mt-3 max-w-sm text-sm text-white/70">
            Kelola survei, kumpulkan respons, dan analisis hasil dengan cepat — dalam
            satu tempat.
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
      <div className="flex items-center justify-center bg-surface px-4 py-12 sm:px-6">
        <div className="w-full max-w-sm">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
