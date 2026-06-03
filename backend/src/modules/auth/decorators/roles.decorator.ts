import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@shared/enums';

export const ROLES_KEY = 'roles';

/**
 * Decorator that sets the required roles for a route handler.
 * Used in combination with RolesGuard to enforce RBAC.
 *
 * @example
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
 * @Post('surveys')
 * async createSurvey() { ... }
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
