import { Outlet, NavLink, Navigate, useLocation } from 'react-router-dom';
import { useEffect, Suspense } from 'react';
import { WifiOff, CloudUpload, FileText, Gift, User, LifeBuoy } from 'lucide-react';
import { NotificationBell } from '@/components/common/NotificationBell';
import { Avatar } from '@/components/common/Avatar';
import { Badge } from '@/components/common/Badge';
import { Button, useTapFeedback } from '@/components/common/Button';
import { Logo } from '@/components/common/Logo';
import { PageLoader } from '@/components/common/PageLoader';
import { useAuthStore } from '@/stores/auth.store';
import { usePointsStore } from '@/stores/points.store';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { isEmbedMode } from '@/utils/embed';
import { NativeBackGuard } from '@/components/common/NativeBackGuard';
import { CountUp } from '@/components/common/CountUp';

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
  const tap = useTapFeedback();

  // Mode FOKUS saat mengisi survei: sembunyikan tab bawah agar responden tak
  // salah keluar dan navigasi Sebelumnya/Selanjutnya/Kirim (sticky) tak bentrok
  // dengan tab bar. Keluar tetap aman (dialog konfirmasi useBlocker).
  const isFillMode = /^\/surveys\/[^/]+\/fill$/.test(location.pathname);

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
      {/* Back Android: di beranda (/surveys) konfirmasi dulu sebelum keluar app. */}
      <NativeBackGuard />
      {/* Header — disembunyikan di mode embed (Elementor sudah punya header) */}
      {!isEmbedMode && (
        <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-8">
              <div className="flex items-center gap-2">
                <Logo size={36} />
                {/* Wordmark disembunyikan di bawah 400px agar header tidak melebar. */}
                <span className="hidden whitespace-nowrap text-sm font-semibold text-gray-900 min-[400px]:inline">
                  Populi Center
                </span>
              </div>
              {/* Nav inline hanya di desktop; di HP memakai tab bawah */}
              <nav className="hidden h-16 gap-6 md:flex">
                {navItems.map(({ path, label }) => (
                  <NavLink
                    key={path}
                    to={path}
                    className={({ isActive }) =>
                      `relative flex items-center text-sm transition-colors ${
                        isActive
                          ? 'font-semibold text-primary-700'
                          : 'font-medium text-gray-600 hover:text-gray-900'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <span
                            className="absolute inset-x-0 top-0 h-0.5 bg-accent-600"
                            aria-hidden="true"
                          />
                        )}
                        {label}
                      </>
                    )}
                  </NavLink>
                ))}
              </nav>
            </div>
            <div className="flex shrink-0 items-center gap-1 sm:gap-3">
              {/* Saat mengisi survei, status offline dan tombol sinkron sudah ada di Notice
                  halaman itu, dan saldo poin tidak ditampilkan agar tidak memengaruhi jawaban. */}
              {!isFillMode && !online && (
                <Badge tone="warning" icon={WifiOff} className="whitespace-nowrap">
                  Offline
                </Badge>
              )}
              {!isFillMode && sync.queuedCount > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => sync.syncNow()}
                  disabled={!online || sync.syncing}
                  title="Sinkronkan jawaban offline"
                  aria-label={`Sinkronkan ${sync.queuedCount} jawaban offline`}
                  className="gap-1 px-2! tabular-nums"
                >
                  <CloudUpload className="h-4 w-4" strokeWidth={1.75} /> {sync.queuedCount}
                </Button>
              )}
              {!isFillMode && points !== null && (
                <NavLink
                  to="/rewards"
                  title="Saldo poin Anda"
                  className="inline-flex min-h-11 items-center whitespace-nowrap text-sm font-medium tabular-nums text-gray-800 hover:text-primary-700"
                >
                  <CountUp value={points} />
                  &nbsp;poin
                </NavLink>
              )}
              <NotificationBell />
              <NavLink
                to="/profile"
                aria-label="Profil"
                className="-mr-1.5 flex h-11 w-11 shrink-0 items-center justify-center"
              >
                <Avatar name={user?.fullName} url={user?.avatarUrl} size={32} />
              </NavLink>
            </div>
          </div>
        </header>
      )}

      {/* Main content. Mode isi survei tanpa jarak atas: strip progres halaman
          itu menempel langsung di bawah header. */}
      <main
        className={`mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 lg:px-8 ${
          isFillMode ? 'pb-8' : 'py-8'
        } ${isEmbedMode || isFillMode ? '' : 'pb-24 md:pb-8'}`}
      >
        {/* Mode isi survei: main tanpa jarak atas, jadi kerangka memuat yang memberi jarak. */}
        <Suspense
          fallback={<PageLoader className={isFillMode ? 'min-h-[40vh] pt-8' : undefined} />}
        >
          <Outlet />
        </Suspense>
      </main>

      {/* Tab bawah — pola mobile yang intuitif; sembunyi di desktop & mode embed.
          'fixed' (bukan 'sticky') agar selalu terlihat menempel di bawah layar —
          di browser mobile, sticky di dalam min-h-screen (100vh) bisa terdorong
          ke bawah area yang terlihat. paddingBottom menghormati safe-area iOS. */}
      {!isEmbedMode && !isFillMode && (
        <nav
          className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white md:hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          aria-label="Navigasi utama"
        >
          <div className="mx-auto grid max-w-md grid-cols-4">
            {navItems.map(({ path, label, icon: Icon }) => (
              <NavLink
                key={path}
                to={path}
                aria-label={label}
                onClick={tap}
                className={({ isActive }) =>
                  `relative flex min-h-14 flex-col items-center justify-center gap-0.5 py-2 text-2xs transition-colors ${
                    isActive
                      ? 'font-semibold text-primary-700'
                      : 'font-medium text-gray-600 hover:text-gray-900'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span
                        className="absolute inset-x-4 -top-px h-0.5 bg-accent-600"
                        aria-hidden="true"
                      />
                    )}
                    <Icon className="h-5 w-5" strokeWidth={1.75} />
                    {label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
