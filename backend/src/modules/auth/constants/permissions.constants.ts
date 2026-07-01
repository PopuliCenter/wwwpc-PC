import { UserRole } from '@shared/enums';

/**
 * Permission matrix defining which roles can perform which operations.
 * Validates: Requirements 5.10, 11.5, 11.6, 11.7
 */
export const Permissions = {
  /** Create, read, update, delete surveys - Req 11.5 */
  SURVEY_CRUD: [UserRole.SUPER_ADMIN, UserRole.ADMIN],

  /** Export data in various formats - Req 11.6 */
  DATA_EXPORT: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ANALYST],

  /** Data cleanup and deletion operations - Req 11.7 */
  DATA_CLEANUP: [UserRole.SUPER_ADMIN, UserRole.ADMIN],

  /** Read-only dashboard access - Req 5.10 */
  DASHBOARD_READ: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER],

  /** User management operations (create, role change, activate/deactivate) */
  USER_MANAGEMENT: [UserRole.SUPER_ADMIN],
} as const;

export type PermissionKey = keyof typeof Permissions;
