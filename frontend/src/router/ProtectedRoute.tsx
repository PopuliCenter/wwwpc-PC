import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import { isEmbedMode } from '@/utils/embed';
import type { UserRole } from '@/types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: UserRole;
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuthStore();
  const location = useLocation();

  if (isLoading) {
    // Di mode embed jangan pakai min-h-screen (100vh) — bikin iframe overshoot.
    return (
      <div
        className={`flex items-center justify-center ${isEmbedMode ? 'min-h-[160px]' : 'min-h-screen'}`}
      >
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredRole && user?.role !== requiredRole) {
    // Allow super_admin and admin to access admin routes
    if (
      requiredRole === 'admin' &&
      (user?.role === 'super_admin' || user?.role === 'analyst' || user?.role === 'viewer')
    ) {
      return <>{children}</>;
    }
    const redirectPath =
      user?.role === 'admin' || user?.role === 'super_admin' ? '/admin/dashboard' : '/surveys';
    return <Navigate to={redirectPath} replace />;
  }

  return <>{children}</>;
}
