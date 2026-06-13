import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { WifiOff, CloudUpload } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useOfflineSync } from '@/hooks/useOfflineSync';

const navItems = [
  { path: '/surveyor/surveys', label: 'Survei Saya' },
  { path: '/profile', label: 'Profil' },
];

export function SurveyorLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const sync = useOfflineSync();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-2">
                <img src="/logo-populi-center.png" alt="Populi Center" className="h-9 w-9 object-contain" />
                <span className="text-lg font-bold text-primary-600">Surveyor TPD</span>
              </div>
              <nav className="flex gap-4">
                {navItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      `text-sm font-medium transition-colors ${
                        isActive
                          ? 'border-b-2 border-primary-600 pb-1 text-primary-600'
                          : 'text-gray-600 hover:text-gray-900'
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </div>
            <div className="flex items-center gap-4">
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
                  title="Sinkronkan respons offline"
                >
                  <CloudUpload className="h-3.5 w-3.5" /> {sync.queuedCount}
                </button>
              )}
              <span className="text-sm text-gray-600">{user?.fullName}</span>
              <button
                onClick={handleLogout}
                className="text-sm text-gray-500 transition-colors hover:text-gray-700"
              >
                Keluar
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
