import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import type { UserRole } from '@/types';

/**
 * Menjaga route admin per-fitur: jika role user tidak termasuk `roles`,
 * dialihkan ke dashboard. Backend tetap penjaga terakhir (403), ini hanya UX.
 */
export function RequireRoles({
  roles,
  children,
}: {
  roles: readonly UserRole[];
  children: React.ReactNode;
}) {
  const user = useAuthStore((s) => s.user);
  if (!user || !roles.includes(user.role)) {
    return <Navigate to="/admin/dashboard" replace />;
  }
  return <>{children}</>;
}
