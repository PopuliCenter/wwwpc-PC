import { Outlet, NavLink, Navigate, useLocation } from 'react-router-dom';
import { useEffect, Suspense } from 'react';
import { WifiOff, CloudUpload, FileText, Gift, User, LifeBuoy } from 'lucide-react';
import { NotificationBell } from '@/components/common/NotificationBell';
import { Avatar } from '@/components/common/Avatar';
import { PageLoader } from '@/components/common/PageLoader';
import { useAuthStore } from '@/stores/auth.store';
import { usePointsStore } from '@/stores/points.store';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { isEmbedMode } from '@/utils/embed';

const navItems = [
  { path: '/surveys', label: 'Survei', icon: FileText },
  { path: '/rewards', label: 'Reward', icon: Gift },
  { path: '/help', label: 'Bantuan', icon: LifeBuoy },
  { path: '/profile', label: 'Profil', icon: User },
];

export function RespondentLayout() {
  const { user } = useAuthStore();
  const location = useLocation();
  const online = useOnlineStatus();
  const sync = useOfflineSync();
  const points = usePointsStore((s) => s.available);
  const refreshPoints = usePointsStore((s) => s.refresh);

  // Saldo poin di header (store bersama dgn halaman Reward agar sinkron). Refresh
  // saat user siap & tiap pindah halaman → poin ikut berubah setelah selesai
  // survei / menukar reward, tanpa perlu reload.
  useEffect(() => {
    if (isEmbedMode || !user) return;
    void refreshPoints();
  }, [user, location.pathname, refreshPoints]);

  // Gerbang data diri: responden yang profilnya BELUM lengkap diarahkan ke
  // halaman "Lengkapi Data Diri" sebelum bisa membuka tab lain. Blokir hanya
  // bila eksplisit false (user lama tanpa flag = anggap lengkap).
  if (user?.profileCompleted === false && location.pathname !== '/complete-profile') {
    return <Navigate to="/complete-profile" replace />;
  }

  return (
    <div className={`flex flex-col ${isEmbedMode ? '' : 'min-h-screen'}`}>
      {/* Header — disembunyikan di mode embed (Elementor sudah punya header) */}
      {!isEmbedMode && (
        <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-2">
                <img
                  src="/logo-populi-center.png"
                  alt="Populi Center"
                  className="h-9 w-9 object-contain"
                />
                <span className="hidden text-lg font-bold text-primary-600 sm:inline">
                  Survei Online
                </span>
              </div>
              {/* Nav inline hanya di desktop; di HP memakai tab bawah */}
              <nav className="hidden gap-5 md:flex">
                {navItems.map(({ path, label }) => (
                  <NavLink
                    key={path}
                    to={path}
                    className={({ isActive }) =>
                      `text-sm font-medium transition-colors ${
                        isActive
                          ? 'border-b-2 border-primary-600 pb-1 text-primary-600'
                          : 'text-gray-600 hover:text-gray-900'
                      }`
                    }
                  >
                    {label}
                  </NavLink>
                ))}
              </nav>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              {!online && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                  <WifiOff className="h-3.5 w-3.5" /> Offline
                </span>
              )}
              {sync.queuedCount > 0 && (
                <button
                  onClick={() => sync.syncNow()}
                  disabled={!online || sync.syncing}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary-100 px-2.5 py-1 text-xs font-medium text-primary-700 disabled:opacity-60"
                  title="Sinkronkan jawaban offline"
                >
                  <CloudUpload className="h-3.5 w-3.5" /> {sync.queuedCount}
                </button>
              )}
              {points !== null && (
                <NavLink
                  to="/rewards"
                  title="Saldo poin Anda"
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-primary-700"
                >
                  <Gift className="h-3.5 w-3.5" /> {points.toLocaleString('id-ID')}
                  <span className="hidden sm:inline">&nbsp;poin</span>
                </NavLink>
              )}
              <NotificationBell />
              <NavLink to="/profile" aria-label="Profil" className="shrink-0">
                <Avatar name={user?.fullName} url={user?.avatarUrl} size={32} />
              </NavLink>
            </div>
          </div>
        </header>
      )}

      {/* Main content */}
      <main
        className={`mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8 ${
          isEmbedMode ? '' : 'pb-24 md:pb-8'
        }`}
      >
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </main>

      {/* Tab bawah — pola mobile yang intuitif; sembunyi di desktop & mode embed.
          'fixed' (bukan 'sticky') agar selalu terlihat menempel di bawah layar —
          di browser mobile, sticky di dalam min-h-screen (100vh) bisa terdorong
          ke bawah area yang terlihat. paddingBottom menghormati safe-area iOS. */}
      {!isEmbedMode && (
        <nav
          className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white md:hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="mx-auto grid max-w-md grid-cols-4">
            {navItems.map(({ path, label, icon: Icon }) => (
              <NavLink
                key={path}
                to={path}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors ${
                    isActive ? 'text-primary-600' : 'text-gray-500 hover:text-gray-700'
                  }`
                }
              >
                <Icon className="h-5 w-5" />
                {label}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
