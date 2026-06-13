import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { WifiOff, CloudUpload } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useOfflineSync } from '@/hooks/useOfflineSync';

const navItems = [
  { path: '/surveys', label: 'Survei' },
  { path: '/rewards', label: 'Reward' },
  { path: '/profile', label: 'Profil' },
];

export function RespondentLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const sync = useOfflineSync();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-2">
                <img src="/logo-populi-center.png" alt="Populi Center" className="h-9 w-9 object-contain" />
                <span className="text-lg font-bold text-primary-600">Survei Online</span>
              </div>
              <nav className="flex gap-4">
                {navItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      `text-sm font-medium transition-colors ${
                        isActive
                          ? 'text-primary-600 border-b-2 border-primary-600 pb-1'
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
                  title="Sinkronkan jawaban offline"
                >
                  <CloudUpload className="h-3.5 w-3.5" /> {sync.queuedCount}
                </button>
              )}
              <span className="text-sm text-gray-600">{user?.fullName}</span>
              <button
                onClick={handleLogout}
                className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                Keluar
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}
