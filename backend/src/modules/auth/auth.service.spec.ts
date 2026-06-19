import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { NotificationService } from '@modules/notification';
import { User, UserStatus } from './entities';
import { UserProfile } from '@modules/registration/entities/user-profile.entity';
import { UserRole } from '@shared/enums';

vi.mock('bcrypt');
vi.mock('uuid', () => ({
  v4: () => 'test-session-id-123',
}));

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: any;
  let jwtService: any;
  let configService: any;
  let cacheManager: any;

  const mockUser: User = {
    id: 'user-id-123',
    email: 'test@example.com',
    phone: '081234567890',
    passwordHash: '$2b$10$hashedpassword',
    fullName: 'Test User',
    role: UserRole.RESPONDENT,
    status: UserStatus.ACTIVE,
    emailVerified: true,
    profileCompleted: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    userRepository = {
      findOne: vi.fn(),
      update: vi.fn().mockResolvedValue({ affected: 1 }),
    };

    jwtService = {
      signAsync: vi.fn(),
      verify: vi.fn(),
    };

    configService = {
      get: vi.fn((key: string) => {
        const config: Record<string, any> = {
          'auth.jwtSecret': 'test-secret',
          'auth.jwtAccessExpiresIn': '15m',
          'auth.jwtRefreshExpiresIn': '7d',
          'auth.sessionTtl': 604800,
        };
        return config[key];
      }),
    };

    cacheManager = {
      set: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      del: vi.fn().mockResolvedValue(undefined),
    };

    const notificationService = {
      sendOtpEmail: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepository },
        {
          provide: getRepositoryToken(UserProfile),
          useValue: { findOne: vi.fn().mockResolvedValue(null) },
        },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: CACHE_MANAGER, useValue: cacheManager },
        { provide: NotificationService, useValue: notificationService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('login', () => {
    it('should return auth result with tokens and user profile on valid credentials', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);
      (bcrypt.compare as any).mockResolvedValue(true);
      jwtService.signAsync
        .mockResolvedValueOnce('access-token-123')
        .mockResolvedValueOnce('refresh-token-123');

      const result = await service.login('test@example.com', 'ValidPass1');

      expect(result).toEqual({
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-123',
        user: {
          id: 'user-id-123',
          email: 'test@example.com',
          fullName: 'Test User',
          role: UserRole.RESPONDENT,
        },
      });
    });

    it('should store session in Redis on successful login', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);
      (bcrypt.compare as any).mockResolvedValue(true);
      jwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      await service.login('test@example.com', 'ValidPass1');

      expect(cacheManager.set).toHaveBeenCalledWith(
        'session:test-session-id-123',
        expect.any(String),
        604800000,
      );
      expect(cacheManager.set).toHaveBeenCalledWith(
        'refresh:test-session-id-123',
        'refresh-token',
        604800000,
      );
    });

    it('should throw generic error when user not found (does not reveal email is wrong)', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        service.login('nonexistent@example.com', 'SomePass1'),
      ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));
    });

    it('should throw generic error when password is wrong (does not reveal password is wrong)', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);
      (bcrypt.compare as any).mockResolvedValue(false);

      await expect(
        service.login('test@example.com', 'WrongPass1'),
      ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));
    });

    it('should return the same error message for wrong email and wrong password', async () => {
      // Wrong email
      userRepository.findOne.mockResolvedValue(null);
      let emailError: UnauthorizedException | undefined;
      try {
        await service.login('wrong@example.com', 'SomePass1');
      } catch (e) {
        emailError = e as UnauthorizedException;
      }

      // Wrong password
      userRepository.findOne.mockResolvedValue(mockUser);
      (bcrypt.compare as any).mockResolvedValue(false);
      let passwordError: UnauthorizedException | undefined;
      try {
        await service.login('test@example.com', 'WrongPass1');
      } catch (e) {
        passwordError = e as UnauthorizedException;
      }

      expect(emailError).toBeDefined();
      expect(passwordError).toBeDefined();
      expect(emailError!.message).toBe(passwordError!.message);
      expect(emailError!.message).toBe('Invalid email or password');
    });

    it('should throw generic error when account is inactive', async () => {
      const inactiveUser = { ...mockUser, status: UserStatus.INACTIVE };
      userRepository.findOne.mockResolvedValue(inactiveUser);

      await expect(
        service.login('test@example.com', 'ValidPass1'),
      ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));
    });

    it('should throw generic error when account is pending', async () => {
      const pendingUser = { ...mockUser, status: UserStatus.PENDING };
      userRepository.findOne.mockResolvedValue(pendingUser);

      await expect(
        service.login('test@example.com', 'ValidPass1'),
      ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));
    });
  });

  describe('logout', () => {
    it('should delete session and refresh token from Redis', async () => {
      await service.logout('session-id-456');

      expect(cacheManager.del).toHaveBeenCalledWith('session:session-id-456');
      expect(cacheManager.del).toHaveBeenCalledWith('refresh:session-id-456');
    });
  });

  describe('refreshToken', () => {
    const validRefreshPayload = {
      sub: 'user-id-123',
      email: 'test@example.com',
      role: UserRole.RESPONDENT,
      sessionId: 'session-id-789',
      type: 'refresh' as const,
    };

    it('should return new token pair on valid refresh token', async () => {
      jwtService.verify.mockReturnValue(validRefreshPayload);
      cacheManager.get
        .mockResolvedValueOnce(JSON.stringify({ userId: 'user-id-123' })) // session
        .mockResolvedValueOnce('old-refresh-token'); // stored refresh token
      userRepository.findOne.mockResolvedValue(mockUser);
      jwtService.signAsync
        .mockResolvedValueOnce('new-access-token')
        .mockResolvedValueOnce('new-refresh-token');

      const result = await service.refreshToken('old-refresh-token');

      expect(result).toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });
    });

    it('should update stored refresh token after rotation', async () => {
      jwtService.verify.mockReturnValue(validRefreshPayload);
      cacheManager.get
        .mockResolvedValueOnce(JSON.stringify({ userId: 'user-id-123' }))
        .mockResolvedValueOnce('old-refresh-token');
      userRepository.findOne.mockResolvedValue(mockUser);
      jwtService.signAsync
        .mockResolvedValueOnce('new-access-token')
        .mockResolvedValueOnce('new-refresh-token');

      await service.refreshToken('old-refresh-token');

      expect(cacheManager.set).toHaveBeenCalledWith(
        'refresh:session-id-789',
        'new-refresh-token',
        604800000,
      );
    });

    it('should throw when refresh token is invalid', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      await expect(service.refreshToken('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw when token type is not refresh', async () => {
      jwtService.verify.mockReturnValue({ ...validRefreshPayload, type: 'access' });

      await expect(service.refreshToken('access-token')).rejects.toThrow(
        new UnauthorizedException('Invalid refresh token'),
      );
    });

    it('should throw when session has expired', async () => {
      jwtService.verify.mockReturnValue(validRefreshPayload);
      cacheManager.get.mockResolvedValue(null); // no session

      await expect(service.refreshToken('some-refresh-token')).rejects.toThrow(
        new UnauthorizedException('Session expired'),
      );
    });

    it('should invalidate session on token reuse (rotation violation)', async () => {
      jwtService.verify.mockReturnValue(validRefreshPayload);
      cacheManager.get
        .mockResolvedValueOnce(JSON.stringify({ userId: 'user-id-123' })) // session exists
        .mockResolvedValueOnce('different-stored-token'); // stored token doesn't match

      await expect(
        service.refreshToken('reused-old-token'),
      ).rejects.toThrow(UnauthorizedException);

      // Should have invalidated the session
      expect(cacheManager.del).toHaveBeenCalledWith('session:session-id-789');
      expect(cacheManager.del).toHaveBeenCalledWith('refresh:session-id-789');
    });

    it('should throw when user is no longer active', async () => {
      jwtService.verify.mockReturnValue(validRefreshPayload);
      cacheManager.get
        .mockResolvedValueOnce(JSON.stringify({ userId: 'user-id-123' }))
        .mockResolvedValueOnce('valid-refresh-token');
      userRepository.findOne.mockResolvedValue({
        ...mockUser,
        status: UserStatus.INACTIVE,
      });

      await expect(
        service.refreshToken('valid-refresh-token'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('validateSession', () => {
    const validAccessPayload = {
      sub: 'user-id-123',
      email: 'test@example.com',
      role: UserRole.RESPONDENT,
      sessionId: 'session-id-abc',
      type: 'access' as const,
    };

    it('should return session info for valid access token with active session', async () => {
      jwtService.verify.mockReturnValue(validAccessPayload);
      cacheManager.get.mockResolvedValue(
        JSON.stringify({ userId: 'user-id-123' }),
      );

      const result = await service.validateSession('valid-access-token');

      expect(result).toEqual({
        userId: 'user-id-123',
        email: 'test@example.com',
        role: UserRole.RESPONDENT,
        sessionId: 'session-id-abc',
      });
    });

    it('should throw when token is invalid', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid');
      });

      await expect(
        service.validateSession('invalid-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw when token type is refresh (not access)', async () => {
      jwtService.verify.mockReturnValue({
        ...validAccessPayload,
        type: 'refresh',
      });

      await expect(
        service.validateSession('refresh-token'),
      ).rejects.toThrow(new UnauthorizedException('Invalid token type'));
    });

    it('should throw when session has been invalidated (logged out)', async () => {
      jwtService.verify.mockReturnValue(validAccessPayload);
      cacheManager.get.mockResolvedValue(null); // session deleted

      await expect(
        service.validateSession('valid-token-but-logged-out'),
      ).rejects.toThrow(
        new UnauthorizedException('Session expired or invalidated'),
      );
    });
  });

  describe('requestPasswordReset', () => {
    it('should generate a 6-digit OTP stored by email with 1-hour TTL when user exists', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);

      await service.requestPasswordReset('test@example.com');

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
      expect(cacheManager.set).toHaveBeenCalledWith(
        'password-reset:test@example.com',
        expect.stringMatching(/^\d{6}$/),
        3600000, // 1 hour in ms
      );
    });

    it('should silently return without storing OTP when user does not exist', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await service.requestPasswordReset('nonexistent@example.com');

      expect(cacheManager.set).not.toHaveBeenCalled();
    });

    it('should not throw for non-existent email (prevents email enumeration)', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        service.requestPasswordReset('nonexistent@example.com'),
      ).resolves.toBeUndefined();
    });
  });

  describe('resetPassword', () => {
    it('should update password hash when OTP is valid', async () => {
      cacheManager.get.mockResolvedValue('123456');
      userRepository.findOne.mockResolvedValue(mockUser);
      (bcrypt.hash as any) = vi.fn().mockResolvedValue('new-hashed-password');

      await service.resetPassword('test@example.com', '123456', 'NewPass123!');

      expect(cacheManager.get).toHaveBeenCalledWith(
        'password-reset:test@example.com',
      );
      expect(userRepository.update).toHaveBeenCalledWith('user-id-123', {
        passwordHash: 'new-hashed-password',
      });
    });

    it('should invalidate OTP after successful password reset', async () => {
      cacheManager.get.mockResolvedValue('123456');
      userRepository.findOne.mockResolvedValue(mockUser);
      (bcrypt.hash as any) = vi.fn().mockResolvedValue('new-hashed-password');

      await service.resetPassword('test@example.com', '123456', 'NewPass123!');

      expect(cacheManager.del).toHaveBeenCalledWith(
        'password-reset:test@example.com',
      );
    });

    it('should throw BadRequestException when OTP is missing or expired', async () => {
      cacheManager.get.mockResolvedValue(null);

      await expect(
        service.resetPassword('test@example.com', '000000', 'NewPass123!'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when OTP does not match', async () => {
      cacheManager.get.mockResolvedValue('123456');

      await expect(
        service.resetPassword('test@example.com', '999999', 'NewPass123!'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when user not found', async () => {
      cacheManager.get.mockResolvedValue('123456');
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        service.resetPassword('deleted@example.com', '123456', 'NewPass123!'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when password is too short', async () => {
      await expect(
        service.resetPassword('test@example.com', '123456', 'Ab1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when password has no uppercase', async () => {
      await expect(
        service.resetPassword('test@example.com', '123456', 'lowercase1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when password has no digit', async () => {
      await expect(
        service.resetPassword('test@example.com', '123456', 'NoDigitHere!'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should accept a password without a symbol (kebijakan selaras registrasi)', async () => {
      cacheManager.get.mockResolvedValue('123456');
      userRepository.findOne.mockResolvedValue(mockUser);
      (bcrypt.hash as any) = vi.fn().mockResolvedValue('hashed');

      await expect(
        service.resetPassword('test@example.com', '123456', 'NoSymbol123'),
      ).resolves.toBeUndefined();
    });

    it('should throw BadRequestException for a common/weak password', async () => {
      await expect(
        service.resetPassword('test@example.com', '123456', 'Password123'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should accept valid password when OTP matches', async () => {
      cacheManager.get.mockResolvedValue('123456');
      userRepository.findOne.mockResolvedValue(mockUser);
      (bcrypt.hash as any) = vi.fn().mockResolvedValue('hashed');

      await expect(
        service.resetPassword('test@example.com', '123456', 'ValidP4ss!'),
      ).resolves.toBeUndefined();
    });
  });
});
