import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserRole } from '@shared/enums';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: any;

  beforeEach(async () => {
    authService = {
      login: vi.fn(),
      logout: vi.fn(),
      refreshToken: vi.fn(),
      requestPasswordReset: vi.fn(),
      resetPassword: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('login', () => {
    it('should return auth result on successful login', async () => {
      const authResult = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: {
          id: 'user-id',
          email: 'test@example.com',
          fullName: 'Test User',
          role: UserRole.RESPONDENT,
        },
      };
      authService.login.mockResolvedValue(authResult);

      const result = await controller.login({
        email: 'test@example.com',
        password: 'ValidPass1',
      });

      expect(result).toEqual(authResult);
      expect(authService.login).toHaveBeenCalledWith(
        'test@example.com',
        'ValidPass1',
      );
    });

    it('should propagate UnauthorizedException from service', async () => {
      authService.login.mockRejectedValue(
        new UnauthorizedException('Invalid email or password'),
      );

      await expect(
        controller.login({
          email: 'test@example.com',
          password: 'wrong',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('should call service logout with session id from request', async () => {
      authService.logout.mockResolvedValue(undefined);
      const req = { user: { sessionId: 'session-123' } };

      await controller.logout(req);

      expect(authService.logout).toHaveBeenCalledWith('session-123');
    });
  });

  describe('refresh', () => {
    it('should return new token pair on valid refresh token', async () => {
      const tokenPair = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      };
      authService.refreshToken.mockResolvedValue(tokenPair);

      const result = await controller.refresh({
        refreshToken: 'old-refresh-token',
      });

      expect(result).toEqual(tokenPair);
      expect(authService.refreshToken).toHaveBeenCalledWith(
        'old-refresh-token',
      );
    });

    it('should propagate UnauthorizedException for invalid refresh token', async () => {
      authService.refreshToken.mockRejectedValue(
        new UnauthorizedException('Invalid refresh token'),
      );

      await expect(
        controller.refresh({ refreshToken: 'invalid' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('requestPasswordReset', () => {
    it('should call service requestPasswordReset with email', async () => {
      authService.requestPasswordReset.mockResolvedValue(undefined);

      await controller.requestPasswordReset({ email: 'test@example.com' });

      expect(authService.requestPasswordReset).toHaveBeenCalledWith(
        'test@example.com',
      );
    });

    it('should not throw even if email does not exist', async () => {
      authService.requestPasswordReset.mockResolvedValue(undefined);

      await expect(
        controller.requestPasswordReset({ email: 'nonexistent@example.com' }),
      ).resolves.toBeUndefined();
    });
  });

  describe('resetPassword', () => {
    it('should call service resetPassword with token and new password', async () => {
      authService.resetPassword.mockResolvedValue(undefined);

      await controller.resetPassword({
        token: 'reset-token-123',
        newPassword: 'NewPass123',
      });

      expect(authService.resetPassword).toHaveBeenCalledWith(
        'reset-token-123',
        'NewPass123',
      );
    });

    it('should propagate BadRequestException for invalid token', async () => {
      authService.resetPassword.mockRejectedValue(
        new BadRequestException('Invalid or expired reset token'),
      );

      await expect(
        controller.resetPassword({
          token: 'invalid-token',
          newPassword: 'NewPass123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should propagate BadRequestException for invalid password', async () => {
      authService.resetPassword.mockRejectedValue(
        new BadRequestException(
          'Password must be at least 8 characters, contain at least 1 uppercase letter and at least 1 digit',
        ),
      );

      await expect(
        controller.resetPassword({
          token: 'valid-token',
          newPassword: 'weak',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
