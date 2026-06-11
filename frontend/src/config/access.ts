import type { UserRole } from '@/types';

/**
 * Sumber kebenaran hak akses fitur admin di frontend — selaras dengan
 * backend `Permissions` (permissions.constants.ts). Dipakai untuk:
 *  - menyembunyikan menu sidebar yang tak boleh diakses, dan
 *  - menjaga route lewat <RequireRoles>.
 */
export const access: Record<string, UserRole[]> = {
  dashboard: ['super_admin', 'admin', 'analyst', 'viewer'],
  surveys: ['super_admin', 'admin'],
  responses: ['super_admin', 'admin', 'analyst'],
  maps: ['super_admin', 'admin', 'analyst'],
  users: ['super_admin'],
  audit: ['super_admin', 'admin'],
  cleanup: ['super_admin', 'admin'],
  profile: ['super_admin', 'admin', 'analyst', 'viewer'],
};

export function hasRole(
  role: UserRole | undefined,
  allowed: readonly UserRole[],
): boolean {
  return !!role && allowed.includes(role);
}
