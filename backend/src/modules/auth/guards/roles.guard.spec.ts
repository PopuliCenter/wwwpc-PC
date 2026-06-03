import { describe, it, expect, beforeEach } from 'vitest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { UserRole } from '@shared/enums';
import { SessionInfo } from '../interfaces';

function createMockExecutionContext(user?: Partial<SessionInfo>): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user: user ?? undefined }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  describe('when no roles are specified on the handler', () => {
    it('should allow access (no RBAC restriction)', () => {
      const context = createMockExecutionContext({
        userId: 'user-1',
        email: 'test@example.com',
        role: UserRole.VIEWER,
        sessionId: 'session-1',
      });

      // No roles metadata set → reflector returns undefined
      reflector.getAllAndOverride = () => undefined;

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow access when roles array is empty', () => {
      const context = createMockExecutionContext({
        userId: 'user-1',
        email: 'test@example.com',
        role: UserRole.VIEWER,
        sessionId: 'session-1',
      });

      reflector.getAllAndOverride = () => [];

      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('when roles are specified', () => {
    it('should allow access when user role matches one of the required roles', () => {
      const context = createMockExecutionContext({
        userId: 'user-1',
        email: 'admin@example.com',
        role: UserRole.ADMIN,
        sessionId: 'session-1',
      });

      reflector.getAllAndOverride = () => [UserRole.SUPER_ADMIN, UserRole.ADMIN];

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow SUPER_ADMIN access to admin-only routes', () => {
      const context = createMockExecutionContext({
        userId: 'user-1',
        email: 'superadmin@example.com',
        role: UserRole.SUPER_ADMIN,
        sessionId: 'session-1',
      });

      reflector.getAllAndOverride = () => [UserRole.SUPER_ADMIN, UserRole.ADMIN];

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should deny access when user role is not in the required roles', () => {
      const context = createMockExecutionContext({
        userId: 'user-1',
        email: 'viewer@example.com',
        role: UserRole.VIEWER,
        sessionId: 'session-1',
      });

      reflector.getAllAndOverride = () => [UserRole.SUPER_ADMIN, UserRole.ADMIN];

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should deny ANALYST access to survey CRUD routes', () => {
      const context = createMockExecutionContext({
        userId: 'user-1',
        email: 'analyst@example.com',
        role: UserRole.ANALYST,
        sessionId: 'session-1',
      });

      reflector.getAllAndOverride = () => [UserRole.SUPER_ADMIN, UserRole.ADMIN];

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should deny RESPONDENT access to admin routes', () => {
      const context = createMockExecutionContext({
        userId: 'user-1',
        email: 'respondent@example.com',
        role: UserRole.RESPONDENT,
        sessionId: 'session-1',
      });

      reflector.getAllAndOverride = () => [UserRole.SUPER_ADMIN, UserRole.ADMIN];

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should allow ANALYST access to export routes', () => {
      const context = createMockExecutionContext({
        userId: 'user-1',
        email: 'analyst@example.com',
        role: UserRole.ANALYST,
        sessionId: 'session-1',
      });

      reflector.getAllAndOverride = () => [
        UserRole.SUPER_ADMIN,
        UserRole.ADMIN,
        UserRole.ANALYST,
      ];

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow VIEWER access to dashboard read routes', () => {
      const context = createMockExecutionContext({
        userId: 'user-1',
        email: 'viewer@example.com',
        role: UserRole.VIEWER,
        sessionId: 'session-1',
      });

      reflector.getAllAndOverride = () => [
        UserRole.SUPER_ADMIN,
        UserRole.ADMIN,
        UserRole.ANALYST,
        UserRole.VIEWER,
      ];

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should deny VIEWER access to data cleanup routes', () => {
      const context = createMockExecutionContext({
        userId: 'user-1',
        email: 'viewer@example.com',
        role: UserRole.VIEWER,
        sessionId: 'session-1',
      });

      reflector.getAllAndOverride = () => [UserRole.SUPER_ADMIN, UserRole.ADMIN];

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('when user is not authenticated', () => {
    it('should throw ForbiddenException when user is undefined', () => {
      const context = createMockExecutionContext(undefined);

      reflector.getAllAndOverride = () => [UserRole.SUPER_ADMIN, UserRole.ADMIN];

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when user has no role', () => {
      const context = createMockExecutionContext({
        userId: 'user-1',
        email: 'test@example.com',
        role: undefined as any,
        sessionId: 'session-1',
      });

      reflector.getAllAndOverride = () => [UserRole.SUPER_ADMIN, UserRole.ADMIN];

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('permission matrix scenarios', () => {
    it('should enforce SURVEY_CRUD: only SUPER_ADMIN and ADMIN', () => {
      const surveyCrudRoles = [UserRole.SUPER_ADMIN, UserRole.ADMIN];
      reflector.getAllAndOverride = () => surveyCrudRoles;

      // Allowed
      for (const role of [UserRole.SUPER_ADMIN, UserRole.ADMIN]) {
        const ctx = createMockExecutionContext({
          userId: 'u1',
          email: 'x@x.com',
          role,
          sessionId: 's1',
        });
        expect(guard.canActivate(ctx)).toBe(true);
      }

      // Denied
      for (const role of [UserRole.ANALYST, UserRole.VIEWER, UserRole.RESPONDENT]) {
        const ctx = createMockExecutionContext({
          userId: 'u1',
          email: 'x@x.com',
          role,
          sessionId: 's1',
        });
        expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
      }
    });

    it('should enforce DATA_EXPORT: SUPER_ADMIN, ADMIN, ANALYST', () => {
      const dataExportRoles = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ANALYST];
      reflector.getAllAndOverride = () => dataExportRoles;

      // Allowed
      for (const role of [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ANALYST]) {
        const ctx = createMockExecutionContext({
          userId: 'u1',
          email: 'x@x.com',
          role,
          sessionId: 's1',
        });
        expect(guard.canActivate(ctx)).toBe(true);
      }

      // Denied
      for (const role of [UserRole.VIEWER, UserRole.RESPONDENT]) {
        const ctx = createMockExecutionContext({
          userId: 'u1',
          email: 'x@x.com',
          role,
          sessionId: 's1',
        });
        expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
      }
    });

    it('should enforce DATA_CLEANUP: only SUPER_ADMIN and ADMIN', () => {
      const dataCleanupRoles = [UserRole.SUPER_ADMIN, UserRole.ADMIN];
      reflector.getAllAndOverride = () => dataCleanupRoles;

      // Allowed
      for (const role of [UserRole.SUPER_ADMIN, UserRole.ADMIN]) {
        const ctx = createMockExecutionContext({
          userId: 'u1',
          email: 'x@x.com',
          role,
          sessionId: 's1',
        });
        expect(guard.canActivate(ctx)).toBe(true);
      }

      // Denied
      for (const role of [UserRole.ANALYST, UserRole.VIEWER, UserRole.RESPONDENT]) {
        const ctx = createMockExecutionContext({
          userId: 'u1',
          email: 'x@x.com',
          role,
          sessionId: 's1',
        });
        expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
      }
    });

    it('should enforce DASHBOARD_READ: all admin roles', () => {
      const dashboardRoles = [
        UserRole.SUPER_ADMIN,
        UserRole.ADMIN,
        UserRole.ANALYST,
        UserRole.VIEWER,
      ];
      reflector.getAllAndOverride = () => dashboardRoles;

      // Allowed
      for (const role of dashboardRoles) {
        const ctx = createMockExecutionContext({
          userId: 'u1',
          email: 'x@x.com',
          role,
          sessionId: 's1',
        });
        expect(guard.canActivate(ctx)).toBe(true);
      }

      // Denied
      const ctx = createMockExecutionContext({
        userId: 'u1',
        email: 'x@x.com',
        role: UserRole.RESPONDENT,
        sessionId: 's1',
      });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should enforce USER_MANAGEMENT: only SUPER_ADMIN', () => {
      const userMgmtRoles = [UserRole.SUPER_ADMIN];
      reflector.getAllAndOverride = () => userMgmtRoles;

      // Allowed
      const ctx = createMockExecutionContext({
        userId: 'u1',
        email: 'x@x.com',
        role: UserRole.SUPER_ADMIN,
        sessionId: 's1',
      });
      expect(guard.canActivate(ctx)).toBe(true);

      // Denied
      for (const role of [UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER, UserRole.RESPONDENT]) {
        const deniedCtx = createMockExecutionContext({
          userId: 'u1',
          email: 'x@x.com',
          role,
          sessionId: 's1',
        });
        expect(() => guard.canActivate(deniedCtx)).toThrow(ForbiddenException);
      }
    });
  });

  describe('error messages', () => {
    it('should throw ForbiddenException with descriptive message', () => {
      const context = createMockExecutionContext({
        userId: 'user-1',
        email: 'viewer@example.com',
        role: UserRole.VIEWER,
        sessionId: 'session-1',
      });

      reflector.getAllAndOverride = () => [UserRole.SUPER_ADMIN];

      try {
        guard.canActivate(context);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as ForbiddenException).message).toBe(
          'Access denied: insufficient permissions',
        );
      }
    });
  });
});
