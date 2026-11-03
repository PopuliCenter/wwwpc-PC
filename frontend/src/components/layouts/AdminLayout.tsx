import { useState, useEffect, Suspense } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { PageLoader } from '@/components/common/PageLoader';
import { NativeBackGuard } from '@/components/common/NativeBackGuard';
import {
  LayoutDashboard,
  ClipboardList,
  MessageSquareText,
  Map as MapIcon,
  Users,
  UserCheck,
  ScrollText,
  Bug,
  Trash2,
  HardDrive,
  UserCog,
  Megaphone,
  LogOut,
  Menu,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { Avatar } from '@/components/common/Avatar';
import { IconButton } from '@/components/common/IconButton';
import { Logo } from '@/components/common/Logo';
import { access, hasRole } from '@/config/access';
import type { UserRole } from '@/types';

interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  roles: UserRole[];
}

const navItems: NavItem[] = [
  { path: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: access.dashboard },
  { path: '/admin/surveys', label: 'Survei', icon: ClipboardList, roles: access.surveys },
  { path: '/admin/responses', label: 'Respons', icon: MessageSquareText, roles: access.responses },
  { path: '/admin/maps', label: 'Peta', icon: MapIcon, roles: access.maps },
  { path: '/admin/respondents', label: 'Responden', icon: UserCheck, roles: access.respondents },
  { path: '/admin/users', label: 'Pengguna', icon: Users, roles: access.users },
  {
    path: '/admin/announcements',
    label: 'Pengumuman',
    icon: Megaphone,
    roles: access.announcements,
  },
  { path: '/admin/audit', label: 'Audit Log', icon: ScrollText, roles: access.audit },
  { path: '/admin/client-logs', label: 'Monitoring Error', icon: Bug, roles: access.audit },
  { path: '/admin/cleanup', label: 'Pembersihan Data', icon: Trash2, roles: access.cleanup },
  { path: '/admin/storage', label: 'Penyimpanan', icon: HardDrive, roles: access.storage },
  { path: '/admin/profile', label: 'Profil', icon: UserCog, roles: access.profile },
];

export function AdminLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  // Drawer sidebar untuk mobile (di desktop sidebar selalu tampil).
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = () => setSidebarOpen(false);

  // Tutup drawer otomatis tiap kali pindah halaman, apa pun pemicunya — jadi
  // pengguna tak perlu menutupnya berulang kali. State bertahan (layout tak
  // remount), jadi tetap tertutup di halaman berikutnya.
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const visibleNav = navItems.filter((item) => hasRole(user?.role, item.roles));

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen bg-surface">
      {/* Back Android: di beranda (/admin/dashboard) konfirmasi sebelum keluar app. */}
      <NativeBackGuard />
      {/* Backdrop gelap — hanya saat drawer terbuka di mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — drawer geser di mobile, statis & sticky di desktop */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-screen w-64 shrink-0 flex-col border-r border-gray-200 bg-white transition-transform duration-200 ease-out md:sticky md:top-0 md:z-auto md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between gap-2 px-5 py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <Logo size={36} />
            <p className="truncate text-sm font-semibold text-gray-900">Populi Center</p>
          </div>
          {/* Tombol tutup — hanya di mobile */}
          <IconButton aria-label="Tutup menu" onClick={closeSidebar} className="md:hidden">
            <X className="h-5 w-5" strokeWidth={1.75} />
          </IconButton>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto py-2">
          {visibleNav.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              onClick={closeSidebar}
              className={({ isActive }) =>
                `group relative flex min-h-11 items-center gap-3 px-5 text-sm transition-colors lg:min-h-10 ${
                  isActive
                    ? 'bg-gray-50 font-semibold text-primary-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span
                      className="absolute inset-y-0 left-0 w-[3px] bg-accent-600"
                      aria-hidden="true"
                    />
                  )}
                  <Icon
                    className={`h-[18px] w-[18px] shrink-0 ${isActive ? '' : 'text-gray-500 group-hover:text-gray-700'}`}
                    strokeWidth={1.75}
                  />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-gray-200 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <Avatar name={user?.fullName} url={user?.avatarUrl} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900">{user?.fullName}</p>
              <p className="truncate text-xs text-gray-600">{user?.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 lg:min-h-10"
          >
            <LogOut className="h-[18px] w-[18px]" strokeWidth={1.75} />
            Keluar
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Hanya di HP, tempat hamburger berada. Judul halaman tetap satu: <h1> di dalam
            halamannya, jadi bar ini menampilkan merek, bukan judul. */}
        <header className="sticky top-0 z-20 border-b border-gray-200 bg-white px-4 py-2 sm:px-6 md:hidden">
          <div className="flex min-h-10 min-w-0 items-center gap-2">
            {/* Hamburger — buka drawer */}
            <IconButton
              aria-label="Buka menu"
              onClick={() => setSidebarOpen(true)}
              className="-ml-2"
            >
              <Menu className="h-5 w-5" strokeWidth={1.75} />
            </IconButton>
            <Logo size={28} />
            <p className="truncate text-sm font-semibold text-gray-900">Populi Center</p>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
