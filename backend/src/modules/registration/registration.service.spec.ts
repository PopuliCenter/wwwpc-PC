import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { BadRequestException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { RegistrationService } from './registration.service';
import { User, UserStatus } from '@modules/auth/entities';
import { UserProfile } from './entities';
import { UserRole } from '@shared/enums';
import { NotificationService } from '@modules/notification';

vi.mock('bcrypt');
vi.mock('uuid', () => ({
  v4: () => 'test-session-id-123',
}));

describe('RegistrationService', () => {
  let service: RegistrationService;
  let userRepository: any;
  let userProfileRepository: any;
  let jwtService: any;
  let configService: any;
  let cacheManager: any;
  let notificationService: any;

  const mockUser: User = {
    id: 'user-id-123',
    email: 'test@example.com',
    phone: '081234567890',
    passwordHash: '$2b$10$hashedpassword',
    fullName: 'Test User',
    role: UserRole.RESPONDENT,
    status: UserStatus.PENDING,
    emailVerified: false,
    profileCompleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    userRepository = {
      findOne: vi.fn(),
      create: vi.fn(),
      save: vi.fn(),
      update: vi.fn().mockResolvedValue({ affected: 1 }),
    };

    userProfileRepository = {
      findOne: vi.fn(),
      create: vi.fn(),
      save: vi.fn(),
      update: vi.fn().mockResolvedValue({ affected: 1 }),
    };

    jwtService = {
      signAsync: vi.fn(),
    };

    configService = {
      get: vi.fn((key: string) => {
        const config: Record<string, any> = {
          'auth.jwtSecret': 'test-secret',
          'auth.jwtAccessExpiresIn': '15m',
          'auth.jwtRefreshExpiresIn': '7d',
        };
        return config[key];
      }),
    };

    cacheManager = {
      set: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      del: vi.fn().mockResolvedValue(undefined),
    };

    notificationService = {
      sendOtpEmail: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegistrationService,
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: getRepositoryToken(UserProfile), useValue: userProfileRepository },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: CACHE_MANAGER, useValue: cacheManager },
        { provide: NotificationService, useValue: notificationService },
      ],
    }).compile();

    service = module.get<RegistrationService>(RegistrationService);
  });

  describe('register', () => {
    const validRegistration = {
      fullName: 'Test User',
      email: 'test@example.com',
      phone: '081234567890',
      password: 'ValidP4ss',
      termsAccepted: true,
    };

    it('should register a new user successfully', async () => {
      userRepository.findOne.mockResolvedValue(null);
      userRepository.create.mockReturnValue(mockUser);
      userRepository.save.mockResolvedValue(mockUser);
      (bcrypt.hash as any) = vi.fn().mockResolvedValue('hashed-password');

      const result = await service.register(validRegistration);

      expect(result.userId).toBe('user-id-123');
      expect(result.email).toBe('test@example.com');
      expect(result.requiresOtp).toBe(true);
      expect(notificationService.sendOtpEmail).toHaveBeenCalled();
    });

    it('should throw BadRequestException when terms not accepted', async () => {
      await expect(
        service.register({ ...validRegistration, termsAccepted: false }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid email format', async () => {
      await expect(
        service.register({ ...validRegistration, email: 'invalid-email' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid phone format', async () => {
      await expect(service.register({ ...validRegistration, phone: '12345' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for weak password', async () => {
      await expect(service.register({ ...validRegistration, password: 'weak' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ConflictException when email already exists', async () => {
      userRepository.findOne.mockResolvedValueOnce(mockUser); // email exists

      await expect(service.register(validRegistration)).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException when phone already exists', async () => {
      userRepository.findOne
        .mockResolvedValueOnce(null) // email doesn't exist
        .mockResolvedValueOnce(mockUser); // phone exists

      await expect(service.register(validRegistration)).rejects.toThrow(ConflictException);
    });

    it('should hash the password before saving', async () => {
      userRepository.findOne.mockResolvedValue(null);
      userRepository.create.mockReturnValue(mockUser);
      userRepository.save.mockResolvedValue(mockUser);
      (bcrypt.hash as any) = vi.fn().mockResolvedValue('hashed-password');

      await service.register(validRegistration);

      expect(bcrypt.hash).toHaveBeenCalledWith('ValidP4ss', 10);
    });

    it('should send OTP after successful registration', async () => {
      userRepository.findOne.mockResolvedValue(null);
      userRepository.create.mockReturnValue(mockUser);
      userRepository.save.mockResolvedValue(mockUser);
      (bcrypt.hash as any) = vi.fn().mockResolvedValue('hashed-password');

      await service.register(validRegistration);

      // OTP should be stored in cache
      expect(cacheManager.set).toHaveBeenCalledWith(
        'otp:test@example.com',
        expect.any(String),
        900000, // 15 min in ms
      );
    });
  });

  describe('sendOtp', () => {
    it('should generate and store a 6-digit OTP in Redis', async () => {
      const result = await service.sendOtp('test@example.com');

      expect(result.message).toContain('OTP has been sent');
      expect(result.expiresInMinutes).toBe(15);
      expect(cacheManager.set).toHaveBeenCalledWith(
        'otp:test@example.com',
        expect.any(String),
        900000,
      );

      // Verify the stored data contains a 6-digit code
      const storedData = JSON.parse(cacheManager.set.mock.calls[0][1]);
      expect(storedData.code).toMatch(/^\d{6}$/);
      expect(storedData.attemptCount).toBe(0);
      expect(storedData.resendCount).toBe(0);
    });
  });

  describe('verifyOtp', () => {
    it('should verify OTP and mark email as verified', async () => {
      const otpData = JSON.stringify({
        code: '123456',
        attemptCount: 0,
        resendCount: 0,
        createdAt: new Date().toISOString(),
      });
      cacheManager.get.mockResolvedValue(otpData);
      userRepository.findOne.mockResolvedValue(mockUser);
      jwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      const result = await service.verifyOtp('test@example.com', '123456');

      expect(result.emailVerified).toBe(true);
      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(userRepository.update).toHaveBeenCalledWith('user-id-123', {
        emailVerified: true,
        status: UserStatus.ACTIVE,
      });
    });

    it('should throw BadRequestException when OTP has expired', async () => {
      cacheManager.get.mockResolvedValue(null);

      await expect(service.verifyOtp('test@example.com', '123456')).rejects.toThrow(
        new BadRequestException('OTP has expired or does not exist'),
      );
    });

    it('should throw BadRequestException for invalid OTP code', async () => {
      const otpData = JSON.stringify({
        code: '123456',
        attemptCount: 0,
        resendCount: 0,
        createdAt: new Date().toISOString(),
      });
      cacheManager.get.mockResolvedValue(otpData);

      await expect(service.verifyOtp('test@example.com', '999999')).rejects.toThrow(
        new BadRequestException('Invalid OTP code'),
      );
    });

    it('should increment attempt count on invalid OTP', async () => {
      const otpData = JSON.stringify({
        code: '123456',
        attemptCount: 0,
        resendCount: 0,
        createdAt: new Date().toISOString(),
      });
      cacheManager.get.mockResolvedValue(otpData);

      try {
        await service.verifyOtp('test@example.com', '999999');
      } catch {
        // expected
      }

      const updatedData = JSON.parse(cacheManager.set.mock.calls[0][1]);
      expect(updatedData.attemptCount).toBe(1);
    });

    it('should delete OTP from Redis after successful verification', async () => {
      const otpData = JSON.stringify({
        code: '123456',
        attemptCount: 0,
        resendCount: 0,
        createdAt: new Date().toISOString(),
      });
      cacheManager.get.mockResolvedValue(otpData);
      userRepository.findOne.mockResolvedValue(mockUser);
      jwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      await service.verifyOtp('test@example.com', '123456');

      expect(cacheManager.del).toHaveBeenCalledWith('otp:test@example.com');
    });
  });

  describe('resendOtp', () => {
    it('should resend OTP and increment resend count', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);
      const existingOtp = JSON.stringify({
        code: '111111',
        attemptCount: 1,
        resendCount: 1,
        createdAt: new Date().toISOString(),
      });
      cacheManager.get.mockResolvedValue(existingOtp);

      const result = await service.resendOtp('test@example.com');

      expect(result.message).toContain('OTP has been resent');
      const storedData = JSON.parse(cacheManager.set.mock.calls[0][1]);
      expect(storedData.resendCount).toBe(2);
      expect(storedData.code).toMatch(/^\d{6}$/);
    });

    it('should throw BadRequestException when user not found', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.resendOtp('unknown@example.com')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when resend limit reached (3 times)', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);
      const existingOtp = JSON.stringify({
        code: '111111',
        attemptCount: 0,
        resendCount: 3,
        createdAt: new Date().toISOString(),
      });
      cacheManager.get.mockResolvedValue(existingOtp);

      await expect(service.resendOtp('test@example.com')).rejects.toThrow(
        new BadRequestException(
          'Maximum OTP resend limit reached (3 times). Please register again.',
        ),
      );
    });

    it('should allow resend when no existing OTP (first send)', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);
      cacheManager.get.mockResolvedValue(null);

      const result = await service.resendOtp('test@example.com');

      expect(result.message).toContain('OTP has been resent');
      const storedData = JSON.parse(cacheManager.set.mock.calls[0][1]);
      expect(storedData.resendCount).toBe(1);
    });
  });

  describe('completeProfile', () => {
    const validProfile = {
      age: 25,
      gender: 'male',
      occupation: 'Software Engineer',
      city: 'Jakarta',
      province: 'DKI Jakarta',
    };

    it('should complete profile and activate account', async () => {
      const verifiedUser = { ...mockUser, emailVerified: true };
      userRepository.findOne.mockResolvedValue(verifiedUser);
      userProfileRepository.findOne.mockResolvedValue(null);
      userProfileRepository.create.mockReturnValue({ id: 'profile-id', ...validProfile });
      userProfileRepository.save.mockResolvedValue({ id: 'profile-id', ...validProfile });

      await service.completeProfile('user-id-123', validProfile);

      expect(userRepository.update).toHaveBeenCalledWith('user-id-123', {
        status: UserStatus.ACTIVE,
        profileCompleted: true,
      });
    });

    it('should throw BadRequestException for invalid profile data', async () => {
      await expect(
        service.completeProfile('user-id-123', {
          age: 5,
          gender: 'invalid',
          occupation: '',
          city: '',
          province: '',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when user not found', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.completeProfile('nonexistent-id', validProfile)).rejects.toThrow(
        new BadRequestException('User not found'),
      );
    });

    it('should throw BadRequestException when email not verified', async () => {
      userRepository.findOne.mockResolvedValue(mockUser); // emailVerified = false

      await expect(service.completeProfile('user-id-123', validProfile)).rejects.toThrow(
        new BadRequestException('Email must be verified before completing profile'),
      );
    });

    it('should update existing profile if one already exists', async () => {
      const verifiedUser = { ...mockUser, emailVerified: true };
      userRepository.findOne.mockResolvedValue(verifiedUser);
      userProfileRepository.findOne.mockResolvedValue({
        id: 'existing-profile-id',
        userId: 'user-id-123',
      });

      await service.completeProfile('user-id-123', validProfile);

      expect(userProfileRepository.update).toHaveBeenCalledWith(
        'existing-profile-id',
        expect.objectContaining({
          age: 25,
          gender: 'male',
          occupation: 'Software Engineer',
          city: 'Jakarta',
          province: 'DKI Jakarta',
        }),
      );
    });
  });
});
