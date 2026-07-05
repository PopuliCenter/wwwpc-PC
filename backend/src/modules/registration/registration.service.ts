import { Injectable, BadRequestException, ConflictException, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { User, UserStatus } from '@modules/auth/entities';
import { UserProfile, Gender } from './entities';
import { RegistrationResult, OtpResult, VerificationResult, OtpData } from './interfaces';
import {
  isValidPassword,
  isValidEmail,
  isValidIndonesianPhone,
  isValidProfile,
  calculateAge,
} from './validators';
import { NotificationService } from '@modules/notification';

const OTP_PREFIX = 'otp:';
const OTP_TTL_SECONDS = 900; // 15 minutes
const MAX_RESEND_COUNT = 3;
const MAX_OTP_ATTEMPTS = 5; // maks. percobaan OTP salah sebelum kode dibatalkan
const BCRYPT_SALT_ROUNDS = 10;

@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserProfile)
    private readonly userProfileRepository: Repository<UserProfile>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Buang akun PENDING (belum terverifikasi) beserta profil demografinya agar
   * email/telepon-nya bebas untuk pendaftaran ulang. Aman: akun PENDING tak bisa
   * login sehingga tak punya respons/poin/penukaran — hanya baris user + profil.
   */
  private async discardPendingAccount(user: User): Promise<void> {
    await this.userProfileRepository.delete({ userId: user.id });
    await this.userRepository.delete({ id: user.id });
    this.logger.log(`Akun PENDING lama dibuang untuk pendaftaran ulang: ${user.email}`);
  }

  async register(data: {
    fullName: string;
    email: string;
    phone: string;
    password: string;
    termsAccepted: boolean;
    // Profil demografi (dikumpulkan saat pendaftaran responden mandiri)
    dateOfBirth?: string;
    age?: number;
    gender?: string;
    occupation?: string;
    education?: string;
    religion?: string;
    city?: string;
    province?: string;
    district?: string;
    address?: string;
  }): Promise<RegistrationResult> {
    // Validate terms acceptance
    if (!data.termsAccepted) {
      throw new BadRequestException('Terms and conditions must be accepted');
    }

    // Validate email format
    if (!isValidEmail(data.email)) {
      throw new BadRequestException('Invalid email format');
    }

    // Validate phone format
    if (!isValidIndonesianPhone(data.phone)) {
      throw new BadRequestException(
        'Invalid phone number format. Must be Indonesian format (08xx or +628xx)',
      );
    }

    // Validate password strength
    if (!isValidPassword(data.password)) {
      throw new BadRequestException(
        'Password must be at least 8 characters, contain at least 1 uppercase letter and at least 1 digit',
      );
    }

    // Check email uniqueness. Akun yang masih PENDING (belum verifikasi OTP)
    // BUKAN penghalang: izinkan daftar ulang dengan menghapus yang lama, agar
    // pengguna tak buntu (mis. gagal verifikasi lalu kena batas kirim ulang →
    // pesan "daftar lagi" yang sebelumnya justru ditolak "email sudah terdaftar").
    const existingEmail = await this.userRepository.findOne({
      where: { email: data.email },
    });
    if (existingEmail) {
      if (existingEmail.status !== UserStatus.PENDING) {
        throw new ConflictException('Email is already registered');
      }
      await this.discardPendingAccount(existingEmail);
    }

    // Check phone uniqueness (perlakuan sama untuk akun PENDING).
    const existingPhone = await this.userRepository.findOne({
      where: { phone: data.phone },
    });
    if (existingPhone) {
      if (existingPhone.status !== UserStatus.PENDING) {
        throw new ConflictException('Phone number is already registered');
      }
      await this.discardPendingAccount(existingPhone);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, BCRYPT_SALT_ROUNDS);

    // Akun dibuat PENDING & belum terverifikasi. Aktivasi terjadi setelah
    // verifikasi OTP email (lihat verifyOtp). Profil demografi tetap disimpan
    // sekarang agar tak hilang bila verifikasi tertunda.
    // Usia diturunkan dari tanggal lahir bila tersedia; fallback ke age langsung.
    const derivedAge = calculateAge(data.dateOfBirth) ?? data.age ?? null;
    const hasProfile = derivedAge != null && !!data.gender;
    const user = this.userRepository.create({
      fullName: data.fullName,
      email: data.email,
      phone: data.phone,
      passwordHash,
      status: UserStatus.PENDING,
      emailVerified: false,
      profileCompleted: hasProfile,
    });

    const savedUser = await this.userRepository.save(user);

    // Simpan profil demografi langsung saat pendaftaran (bila disertakan).
    if (hasProfile) {
      const profile = this.userProfileRepository.create({
        userId: savedUser.id,
        dateOfBirth: data.dateOfBirth ?? null,
        age: derivedAge,
        gender: data.gender as Gender,
        occupation: data.occupation ?? undefined,
        education: data.education ?? null,
        religion: data.religion ?? null,
        city: data.city ?? undefined,
        province: data.province ?? undefined,
        district: data.district ?? null,
        address: data.address ?? null,
      });
      await this.userProfileRepository.save(profile);
    }

    // Kirim OTP ke email untuk verifikasi (akun belum aktif sampai diverifikasi).
    await this.sendOtp(savedUser.email);

    this.logger.log(`User registered (pending OTP): ${data.email}`);

    return {
      userId: savedUser.id,
      email: savedUser.email,
      message: 'Kode OTP telah dikirim ke email Anda untuk verifikasi.',
      requiresOtp: true,
    };
  }

  async sendOtp(email: string): Promise<OtpResult> {
    // Generate 6-digit OTP code
    const code = this.generateOtpCode();

    // Store OTP in Redis with TTL
    const otpData: OtpData = {
      code,
      attemptCount: 0,
      resendCount: 0,
      createdAt: new Date().toISOString(),
    };

    await this.cacheManager.set(
      `${OTP_PREFIX}${email}`,
      JSON.stringify(otpData),
      OTP_TTL_SECONDS * 1000, // cache-manager expects ms
    );

    // Kirim email OTP (antrian Bull → Resend). OTP TIDAK di-log demi keamanan.
    const user = await this.userRepository.findOne({ where: { email } });
    await this.notificationService.sendOtpEmail(
      email,
      user?.fullName ?? 'Pengguna',
      code,
      OTP_TTL_SECONDS / 60,
    );
    this.logger.log(`OTP issued for ${email}`);

    return {
      message: 'OTP has been sent to your email',
      expiresInMinutes: 15,
    };
  }

  async verifyOtp(email: string, code: string): Promise<VerificationResult> {
    // Get OTP data from Redis
    const otpDataStr = await this.cacheManager.get<string>(`${OTP_PREFIX}${email}`);

    if (!otpDataStr) {
      throw new BadRequestException('OTP has expired or does not exist');
    }

    const otpData: OtpData = JSON.parse(otpDataStr);

    // Lockout: terlalu banyak percobaan salah → batalkan OTP (harus minta kirim ulang).
    if (otpData.attemptCount >= MAX_OTP_ATTEMPTS) {
      await this.cacheManager.del(`${OTP_PREFIX}${email}`);
      throw new BadRequestException(
        'Terlalu banyak percobaan OTP. Kode dibatalkan — silakan minta kirim ulang.',
      );
    }

    // Validate OTP code
    if (otpData.code !== code) {
      // Increment attempt count; batalkan kode bila mencapai batas.
      otpData.attemptCount += 1;
      if (otpData.attemptCount >= MAX_OTP_ATTEMPTS) {
        await this.cacheManager.del(`${OTP_PREFIX}${email}`);
        throw new BadRequestException(
          'Terlalu banyak percobaan OTP. Kode dibatalkan — silakan minta kirim ulang.',
        );
      }
      await this.cacheManager.set(
        `${OTP_PREFIX}${email}`,
        JSON.stringify(otpData),
        OTP_TTL_SECONDS * 1000,
      );
      throw new BadRequestException('Invalid OTP code');
    }

    // OTP is valid - mark email as verified
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // OTP valid → email terverifikasi & akun diaktifkan.
    await this.userRepository.update(user.id, {
      emailVerified: true,
      status: UserStatus.ACTIVE,
    });

    // Remove OTP from Redis
    await this.cacheManager.del(`${OTP_PREFIX}${email}`);

    // Buat sesi + token agar pengguna langsung login setelah verifikasi.
    const sessionId = uuidv4();
    const tokenPair = await this.generateTokenPair(user, sessionId);
    await this.storeSession(user, sessionId, tokenPair.refreshToken);

    this.logger.log(`Email verified & account activated for ${email}`);

    return {
      userId: user.id,
      email: user.email,
      emailVerified: true,
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }

  async resendOtp(email: string): Promise<OtpResult> {
    // Check if user exists
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Get existing OTP data to check resend count
    const otpDataStr = await this.cacheManager.get<string>(`${OTP_PREFIX}${email}`);

    let resendCount = 0;
    if (otpDataStr) {
      const existingOtpData: OtpData = JSON.parse(otpDataStr);
      resendCount = existingOtpData.resendCount;
    }

    // Check resend limit
    if (resendCount >= MAX_RESEND_COUNT) {
      throw new BadRequestException(
        'Maximum OTP resend limit reached (3 times). Please register again.',
      );
    }

    // Generate new OTP
    const code = this.generateOtpCode();

    const otpData: OtpData = {
      code,
      attemptCount: 0,
      resendCount: resendCount + 1,
      createdAt: new Date().toISOString(),
    };

    await this.cacheManager.set(
      `${OTP_PREFIX}${email}`,
      JSON.stringify(otpData),
      OTP_TTL_SECONDS * 1000,
    );

    // Kirim ulang email OTP. OTP TIDAK di-log demi keamanan.
    await this.notificationService.sendOtpEmail(email, user.fullName, code, OTP_TTL_SECONDS / 60);
    this.logger.log(`OTP reissued for ${email} (resend #${resendCount + 1})`);

    return {
      message: 'OTP has been resent to your email',
      expiresInMinutes: 15,
    };
  }

  async completeProfile(
    userId: string,
    profile: {
      dateOfBirth?: string;
      age?: number;
      gender: string;
      occupation: string;
      education?: string;
      religion?: string;
      city: string;
      province: string;
      district?: string;
      address?: string;
    },
  ): Promise<void> {
    // Usia diturunkan dari tanggal lahir bila tersedia.
    const derivedAge = calculateAge(profile.dateOfBirth) ?? profile.age ?? undefined;

    // Validate profile fields
    const validation = isValidProfile({ ...profile, age: derivedAge as number });
    if (!validation.valid) {
      throw new BadRequestException(validation.errors);
    }

    // Check user exists
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Check email is verified
    if (!user.emailVerified) {
      throw new BadRequestException('Email must be verified before completing profile');
    }

    // Create or update user profile
    let userProfile = await this.userProfileRepository.findOne({
      where: { userId },
    });

    if (userProfile) {
      await this.userProfileRepository.update(userProfile.id, {
        dateOfBirth: profile.dateOfBirth ?? null,
        age: derivedAge,
        gender: profile.gender as Gender,
        occupation: profile.occupation,
        education: profile.education ?? null,
        religion: profile.religion ?? null,
        city: profile.city,
        province: profile.province,
        district: profile.district ?? null,
        address: profile.address ?? null,
      });
    } else {
      userProfile = this.userProfileRepository.create({
        userId,
        dateOfBirth: profile.dateOfBirth ?? null,
        age: derivedAge,
        gender: profile.gender as Gender,
        occupation: profile.occupation,
        education: profile.education ?? null,
        religion: profile.religion ?? null,
        city: profile.city,
        province: profile.province,
        district: profile.district ?? null,
        address: profile.address ?? null,
      });
      await this.userProfileRepository.save(userProfile);
    }

    // Activate user account
    await this.userRepository.update(userId, {
      status: UserStatus.ACTIVE,
      profileCompleted: true,
    });

    this.logger.log(`Profile completed and account activated for user ${userId}`);
  }

  private generateOtpCode(): string {
    // Use cryptographically secure RNG — Math.random() is NOT suitable for OTPs
    // randomInt(min, max) returns integer in [min, max) — guarantees exactly 6 digits
    return randomInt(100000, 1000000).toString();
  }

  /** Simpan sesi + refresh token di Redis agar token lolos validasi JwtStrategy. */
  private async storeSession(user: User, sessionId: string, refreshToken: string): Promise<void> {
    const sessionTtl = this.configService.get<number>('auth.sessionTtl') ?? 86400;
    await this.cacheManager.set(
      `session:${sessionId}`,
      JSON.stringify({
        userId: user.id,
        email: user.email,
        role: user.role,
        createdAt: new Date().toISOString(),
      }),
      sessionTtl * 1000,
    );
    await this.cacheManager.set(`refresh:${sessionId}`, refreshToken, sessionTtl * 1000);
  }

  private async generateTokenPair(
    user: User,
    sessionId: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionId,
      type: 'access',
    };

    const refreshPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionId,
      type: 'refresh',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        accessPayload as any,
        {
          expiresIn: this.configService.get<string>('auth.jwtAccessExpiresIn') ?? '15m',
        } as any,
      ),
      this.jwtService.signAsync(
        refreshPayload as any,
        {
          expiresIn: this.configService.get<string>('auth.jwtRefreshExpiresIn') ?? '7d',
        } as any,
      ),
    ]);

    return { accessToken, refreshToken };
  }
}
