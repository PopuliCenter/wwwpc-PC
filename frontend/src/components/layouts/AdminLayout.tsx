import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ClipboardList,
  MessageSquareText,
  Map as MapIcon,
  Users,
  UserCheck,
  ScrollText,
  Trash2,
  UserCog,
  Megaphone,
  LogOut,
  Menu,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
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
  { path: '/admin/announcements', label: 'Pengumuman', icon: Megaphone, roles: access.announcements },
  { path: '/admin/audit', label: 'Audit Log', icon: ScrollText, roles: access.audit },
  { path: '/admin/cleanup', label: 'Data Cleanup', icon: Trash2, roles: access.cleanup },
  { path: '/admin/profile', label: 'Profil', icon: UserCog, roles: access.profile },
];

function initials(name?: string): string {
  if (!name) return 'PC';
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
}

export function AdminLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  // Drawer sidebar untuk mobile (di desktop sidebar selalu tampil).
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = () => setSidebarOpen(false);

  const visibleNav = navItems.filter((item) => hasRole(user?.role, item.roles));

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen bg-surface">
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
        className={`fixed inset-y-0 left-0 z-40 flex h-screen w-64 shrink-0 flex-col border-r border-gray-800 bg-gray-900 text-white transition-transform duration-200 ease-out md:sticky md:top-0 md:z-auto md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <div className="flex items-center gap-3">
            <img
              src="/logo-populi-center.png"
              alt="Populi Center"
              className="h-10 w-10 object-contain"
            />
            <div className="leading-tight">
              <h1 className="text-sm font-semibold text-white">Populi Center</h1>
              <p className="text-xs text-gray-400">Survei Online</p>
            </div>
          </div>
          {/* Tombol tutup — hanya di mobile */}
          <button
            onClick={closeSidebar}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-white/5 hover:text-white md:hidden"
            aria-label="Tutup menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {visibleNav.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              onClick={closeSidebar}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'text-gray-300 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={`h-[18px] w-[18px] ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-white'}`}
                    strokeWidth={1.85}
                  />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-gray-800 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-600/90 text-xs font-semibold text-white">
              {initials(user?.fullName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{user?.fullName}</p>
              <p className="truncate text-xs text-gray-400">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-[18px] w-[18px]" strokeWidth={1.85} />
            Keluar
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-gray-200 bg-surface/80 px-4 py-3 backdrop-blur sm:px-6 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              {/* Hamburger — buka drawer (mobile saja) */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900 md:hidden"
                aria-label="Buka menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <h2 className="truncate text-base font-semibold text-gray-900">Panel Admin</h2>
            </div>
            <span className="hidden truncate text-sm text-gray-500 sm:block">{user?.email}</span>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
