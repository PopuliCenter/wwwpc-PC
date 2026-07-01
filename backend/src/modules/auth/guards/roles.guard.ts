import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@shared/enums';
import { ROLES_KEY } from '../decorators';
import { SessionInfo } from '../interfaces';

/**
 * Guard that checks if the authenticated user's role is in the
 * list of allowed roles set by the @Roles() decorator.
 *
 * Must be used after JwtAuthGuard so that req.user is populated.
 *
 * If no @Roles() decorator is present on the handler, access is allowed
 * (the route is considered public to any authenticated user).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no roles are specified, allow access (no RBAC restriction)
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: SessionInfo = request.user;

    if (!user || !user.role) {
      throw new ForbiddenException('Access denied: insufficient permissions');
    }

    const hasRole = requiredRoles.includes(user.role);

    if (!hasRole) {
      throw new ForbiddenException('Access denied: insufficient permissions');
    }

    return true;
  }
}
