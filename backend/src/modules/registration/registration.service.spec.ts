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
import { AuthService } from '@modules/auth/auth.service';

/** Cache mock yang membedakan kunci (record OTP vs penghitung kirim). */
function keyedGet(values: Record<string, unknown>) {
  return vi.fn((key: string) => Promise.resolve(values[key] ?? null));
}
/** Panggilan cache.set untuk kunci tertentu. */
function setCallsFor(cache: any, key: string): any[][] {
  return cache.set.mock.calls.filter((c: any[]) => c[0] === key);
}

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
  let authService: any;

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
    tokenVersion: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as User;

  beforeEach(async () => {
    userRepository = {
      findOne: vi.fn(),
      create: vi.fn(),
      save: vi.fn(),
      update: vi.fn().mockResolvedValue({ affected: 1 }),
      delete: vi.fn().mockResolvedValue({ affected: 1 }),
    };

    userProfileRepository = {
      findOne: vi.fn(),
      create: vi.fn(),
      save: vi.fn(),
      update: vi.fn().mockResolvedValue({ affected: 1 }),
      delete: vi.fn().mockResolvedValue({ affected: 1 }),
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

    authService = {
      issueSession: vi.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: { id: 'user-id-123' },
      }),
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
        { provide: AuthService, useValue: authService },
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

    const activeUser = { ...mockUser, status: UserStatus.ACTIVE };

    it('should throw ConflictException when email already exists (akun AKTIF)', async () => {
      userRepository.findOne.mockResolvedValueOnce(activeUser); // email exists (active)

      await expect(service.register(validRegistration)).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException when phone already exists (akun AKTIF)', async () => {
      userRepository.findOne
        .mockResolvedValueOnce(null) // email doesn't exist
        .mockResolvedValueOnce(activeUser); // phone exists (active)

      await expect(service.register(validRegistration)).rejects.toThrow(ConflictException);
    });

    it('mengizinkan daftar ulang bila akun lama masih PENDING (M5) — buang lalu buat baru', async () => {
      userRepository.findOne
        .mockResolvedValueOnce(mockUser) // email match, status PENDING → dibuang
        .mockResolvedValueOnce(null); // phone bebas
      userRepository.create.mockReturnValue(mockUser);
      userRepository.save.mockResolvedValue(mockUser);

      await expect(service.register(validRegistration)).resolves.toBeDefined();
      // Akun PENDING lama beserta profilnya dibuang.
      expect(userProfileRepository.delete).toHaveBeenCalledWith({ userId: mockUser.id });
      expect(userRepository.delete).toHaveBeenCalledWith({ id: mockUser.id });
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

  describe('checkAvailability', () => {
    const activeUser = { ...mockUser, status: UserStatus.ACTIVE };
    const pendingUser = { ...mockUser, status: UserStatus.PENDING };

    it('email/telepon AKTIF → terpakai', async () => {
      userRepository.findOne
        .mockResolvedValueOnce(activeUser) // email
        .mockResolvedValueOnce(activeUser); // phone
      await expect(service.checkAvailability('a@x.com', '0812')).resolves.toEqual({
        emailTaken: true,
        phoneTaken: true,
      });
    });

    it('akun PENDING TIDAK dianggap terpakai (boleh daftar ulang)', async () => {
      userRepository.findOne
        .mockResolvedValueOnce(pendingUser) // email
        .mockResolvedValueOnce(null); // phone bebas
      await expect(service.checkAvailability('a@x.com', '0812')).resolves.toEqual({
        emailTaken: false,
        phoneTaken: false,
      });
    });

    it('email/telepon belum ada → bebas', async () => {
      userRepository.findOne.mockResolvedValue(null);
      await expect(service.checkAvailability('new@x.com', '0899')).resolves.toEqual({
        emailTaken: false,
        phoneTaken: false,
      });
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
      // Update BERSYARAT status PENDING (atomik, audit T-02).
      expect(userRepository.update).toHaveBeenCalledWith(
        { id: 'user-id-123', status: UserStatus.PENDING },
        { emailVerified: true, status: UserStatus.ACTIVE },
      );
      expect(authService.issueSession).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user-id-123', status: UserStatus.ACTIVE }),
      );
    });

    it('should throw BadRequestException when OTP has expired', async () => {
      cacheManager.get.mockResolvedValue(null);

      await expect(service.verifyOtp('test@example.com', '123456')).rejects.toThrow(
        new BadRequestException('Kode OTP salah atau sudah kedaluwarsa'),
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
        new BadRequestException('Kode OTP salah atau sudah kedaluwarsa'),
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

    it('membatalkan OTP setelah percobaan salah melebihi batas (lockout)', async () => {
      // attemptCount 4; percobaan salah ke-5 (MAX_OTP_ATTEMPTS=5) → kode dibatalkan.
      const otpData = JSON.stringify({
        code: '123456',
        attemptCount: 4,
        resendCount: 0,
        createdAt: new Date().toISOString(),
      });
      cacheManager.get.mockResolvedValue(otpData);

      await expect(service.verifyOtp('test@example.com', '999999')).rejects.toThrow(
        /Terlalu banyak percobaan/,
      );
      // OTP dihapus dari Redis (dibatalkan), bukan sekadar di-increment.
      expect(cacheManager.del).toHaveBeenCalledWith('otp:test@example.com');
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
    const otpRecord = (resendCount: number) =>
      JSON.stringify({
        code: '111111',
        attemptCount: 1,
        resendCount,
        createdAt: new Date().toISOString(),
      });

    it('should resend OTP and increment resend count (akun PENDING)', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);
      cacheManager.get = keyedGet({ 'otp:test@example.com': otpRecord(1) });

      const result = await service.resendOtp('test@example.com');

      expect(result.message).toMatch(/kode OTP baru telah dikirim/i);
      const [call] = setCallsFor(cacheManager, 'otp:test@example.com');
      const storedData = JSON.parse(call[1]);
      expect(storedData.resendCount).toBe(2);
      expect(storedData.code).toMatch(/^\d{6}$/);
      expect(notificationService.sendOtpEmail).toHaveBeenCalled();
    });

    it('email tak terdaftar → respons generik yang SAMA, tanpa email (bukan oracle)', async () => {
      userRepository.findOne.mockResolvedValueOnce(mockUser);
      const known = await service.resendOtp('test@example.com');
      userRepository.findOne.mockResolvedValueOnce(null);
      const unknown = await service.resendOtp('unknown@example.com');

      expect(unknown).toEqual(known);
      expect(notificationService.sendOtpEmail).toHaveBeenCalledTimes(1);
    });

    it.each([UserStatus.ACTIVE, UserStatus.INACTIVE])(
      'akun berstatus %s tidak dikirimi OTP (audit T-02)',
      async (status) => {
        userRepository.findOne.mockResolvedValue({ ...mockUser, status });

        const result = await service.resendOtp('test@example.com');

        expect(result.message).toMatch(/Jika email terdaftar/);
        expect(notificationService.sendOtpEmail).not.toHaveBeenCalled();
        expect(setCallsFor(cacheManager, 'otp:test@example.com')).toHaveLength(0);
      },
    );

    it('should throw BadRequestException when resend limit reached (3 times)', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);
      cacheManager.get = keyedGet({ 'otp:test@example.com': otpRecord(3) });

      await expect(service.resendOtp('test@example.com')).rejects.toThrow(
        new BadRequestException(
          'Maximum OTP resend limit reached (3 times). Please register again.',
        ),
      );
    });

    it('batas kirim per email (terpisah dari record OTP) tak bisa di-reset lewat tebakan salah (T-29)', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);
      // Record OTP sudah dihapus (mis. setelah 5 tebakan salah) → resendCount "0",
      // tapi penghitung per email sudah mencapai batas.
      cacheManager.get = keyedGet({ 'otp-send-count:test@example.com': 5 });

      await expect(service.resendOtp('test@example.com')).rejects.toThrow(
        /Terlalu banyak permintaan kode OTP/,
      );
      expect(notificationService.sendOtpEmail).not.toHaveBeenCalled();
    });

    it('penghitung kirim per email dinaikkan juga untuk email tak terdaftar', async () => {
      userRepository.findOne.mockResolvedValue(null);
      cacheManager.get = keyedGet({ 'otp-send-count:x@example.com': 2 });

      await service.resendOtp('x@example.com');

      expect(cacheManager.set).toHaveBeenCalledWith('otp-send-count:x@example.com', 3, 3600000);
    });

    it('should allow resend when no existing OTP (first send)', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);
      cacheManager.get.mockResolvedValue(null);

      await service.resendOtp('test@example.com');

      const [call] = setCallsFor(cacheManager, 'otp:test@example.com');
      expect(JSON.parse(call[1]).resendCount).toBe(1);
    });
  });

  describe('verifyOtp — audit T-02 (hanya akun PENDING)', () => {
    const validOtp = JSON.stringify({
      code: '123456',
      attemptCount: 0,
      resendCount: 0,
      createdAt: new Date().toISOString(),
    });

    it.each([UserStatus.ACTIVE, UserStatus.INACTIVE])(
      'OTP benar untuk akun %s TIDAK mengaktifkan akun & TIDAK menerbitkan token',
      async (status) => {
        cacheManager.get.mockResolvedValue(validOtp);
        userRepository.findOne.mockResolvedValue({ ...mockUser, status, emailVerified: true });

        await expect(service.verifyOtp('test@example.com', '123456')).rejects.toThrow(
          new BadRequestException('Kode OTP salah atau sudah kedaluwarsa'),
        );
        expect(userRepository.update).not.toHaveBeenCalled();
        expect(authService.issueSession).not.toHaveBeenCalled();
        // Kode tetap dibuang (sekali pakai).
        expect(cacheManager.del).toHaveBeenCalledWith('otp:test@example.com');
      },
    );

    it('email tak terdaftar → pesan generik yang sama', async () => {
      cacheManager.get.mockResolvedValue(validOtp);
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.verifyOtp('ghost@example.com', '123456')).rejects.toThrow(
        new BadRequestException('Kode OTP salah atau sudah kedaluwarsa'),
      );
    });

    it('balapan: status berubah sebelum update bersyarat → tidak ada token', async () => {
      cacheManager.get.mockResolvedValue(validOtp);
      userRepository.findOne.mockResolvedValue(mockUser);
      userRepository.update.mockResolvedValue({ affected: 0 });

      await expect(service.verifyOtp('test@example.com', '123456')).rejects.toThrow(
        BadRequestException,
      );
      expect(authService.issueSession).not.toHaveBeenCalled();
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

    it('should complete profile WITHOUT touching account status (audit T-02)', async () => {
      const verifiedUser = { ...mockUser, emailVerified: true, status: UserStatus.INACTIVE };
      userRepository.findOne.mockResolvedValue(verifiedUser);
      userProfileRepository.findOne.mockResolvedValue(null);
      userProfileRepository.create.mockReturnValue({ id: 'profile-id', ...validProfile });
      userProfileRepository.save.mockResolvedValue({ id: 'profile-id', ...validProfile });

      await service.completeProfile('user-id-123', validProfile);

      expect(userRepository.update).toHaveBeenCalledWith('user-id-123', {
        profileCompleted: true,
      });
      // Tidak ada panggilan update yang menulis status.
      for (const call of userRepository.update.mock.calls) {
        expect(call[1]).not.toHaveProperty('status');
      }
    });

    it('menolak pemanggilan ulang setelah profil lengkap — demografi terkunci (audit T-10)', async () => {
      userRepository.findOne.mockResolvedValue({
        ...mockUser,
        emailVerified: true,
        profileCompleted: true,
      });

      await expect(service.completeProfile('user-id-123', validProfile)).rejects.toThrow(
        ConflictException,
      );
      expect(userProfileRepository.update).not.toHaveBeenCalled();
      expect(userProfileRepository.save).not.toHaveBeenCalled();
      expect(userRepository.update).not.toHaveBeenCalled();
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

  describe('register — batas kirim OTP per email (audit T-29)', () => {
    it('menolak daftar-ulang bila kuota kirim OTP email ini habis, sebelum akun lama dibuang', async () => {
      cacheManager.get = keyedGet({ 'otp-send-count:test@example.com': 5 });
      userRepository.findOne.mockResolvedValue(mockUser); // PENDING lama

      await expect(
        service.register({
          fullName: 'Test User',
          email: 'test@example.com',
          phone: '081234567890',
          password: 'ValidP4ss',
          termsAccepted: true,
        }),
      ).rejects.toThrow(/Terlalu banyak permintaan kode OTP/);
      expect(userRepository.delete).not.toHaveBeenCalled();
      expect(notificationService.sendOtpEmail).not.toHaveBeenCalled();
    });
  });
});
