import {
  Injectable,
  BadRequestException,
  ConflictException,
  Inject,
  Logger,
} from '@nestjs/common';
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
import {
  RegistrationResult,
  OtpResult,
  VerificationResult,
  OtpData,
} from './interfaces';
import {
  isValidPassword,
  isValidEmail,
  isValidIndonesianPhone,
  isValidProfile,
} from './validators';

const OTP_PREFIX = 'otp:';
const OTP_TTL_SECONDS = 900; // 15 minutes
const MAX_RESEND_COUNT = 3;
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
  ) {}

  async register(data: {
    fullName: string;
    email: string;
    phone: string;
    password: string;
    termsAccepted: boolean;
    // Profil demografi (dikumpulkan saat pendaftaran responden mandiri)
    age?: number;
    gender?: string;
    occupation?: string;
    education?: string;
    religion?: string;
    city?: string;
    province?: string;
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

    // Check email uniqueness
    const existingEmail = await this.userRepository.findOne({
      where: { email: data.email },
    });
    if (existingEmail) {
      throw new ConflictException('Email is already registered');
    }

    // Check phone uniqueness
    const existingPhone = await this.userRepository.findOne({
      where: { phone: data.phone },
    });
    if (existingPhone) {
      throw new ConflictException('Phone number is already registered');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, BCRYPT_SALT_ROUNDS);

    // Auto-aktif tanpa OTP: akun langsung ACTIVE & dianggap terverifikasi.
    const hasProfile = data.age != null && !!data.gender;
    const user = this.userRepository.create({
      fullName: data.fullName,
      email: data.email,
      phone: data.phone,
      passwordHash,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      profileCompleted: hasProfile,
    });

    const savedUser = await this.userRepository.save(user);

    // Simpan profil demografi langsung saat pendaftaran (bila disertakan).
    if (hasProfile) {
      const profile = this.userProfileRepository.create({
        userId: savedUser.id,
        age: data.age,
        gender: data.gender as Gender,
        occupation: data.occupation ?? undefined,
        education: data.education ?? null,
        religion: data.religion ?? null,
        city: data.city ?? undefined,
        province: data.province ?? undefined,
        address: data.address ?? null,
      });
      await this.userProfileRepository.save(profile);
    }

    // Buat sesi + token agar pengguna langsung login setelah daftar.
    const sessionId = uuidv4();
    const tokenPair = await this.generateTokenPair(savedUser, sessionId);
    await this.storeSession(savedUser, sessionId, tokenPair.refreshToken);

    this.logger.log(`User registered & activated: ${data.email}`);

    return {
      userId: savedUser.id,
      email: savedUser.email,
      message: 'Registration successful.',
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      user: {
        id: savedUser.id,
        email: savedUser.email,
        fullName: savedUser.fullName,
        role: savedUser.role,
      },
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

    // In production, this would send an email via NotificationService
    // OTP code is intentionally NOT logged to prevent credential leakage
    this.logger.log(`OTP issued for ${email}`);

    return {
      message: 'OTP has been sent to your email',
      expiresInMinutes: 15,
    };
  }

  async verifyOtp(email: string, code: string): Promise<VerificationResult> {
    // Get OTP data from Redis
    const otpDataStr = await this.cacheManager.get<string>(
      `${OTP_PREFIX}${email}`,
    );

    if (!otpDataStr) {
      throw new BadRequestException('OTP has expired or does not exist');
    }

    const otpData: OtpData = JSON.parse(otpDataStr);

    // Validate OTP code
    if (otpData.code !== code) {
      // Increment attempt count
      otpData.attemptCount += 1;
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

    await this.userRepository.update(user.id, { emailVerified: true });

    // Remove OTP from Redis
    await this.cacheManager.del(`${OTP_PREFIX}${email}`);

    // Generate tokens so user can proceed to profile completion
    const sessionId = uuidv4();
    const tokenPair = await this.generateTokenPair(user, sessionId);

    this.logger.log(`Email verified for ${email}`);

    return {
      userId: user.id,
      email: user.email,
      emailVerified: true,
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
    };
  }

  async resendOtp(email: string): Promise<OtpResult> {
    // Check if user exists
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Get existing OTP data to check resend count
    const otpDataStr = await this.cacheManager.get<string>(
      `${OTP_PREFIX}${email}`,
    );

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

    // In production, this would send an email
    // OTP code is intentionally NOT logged to prevent credential leakage
    this.logger.log(`OTP reissued for ${email} (resend #${resendCount + 1})`);

    return {
      message: 'OTP has been resent to your email',
      expiresInMinutes: 15,
    };
  }

  async completeProfile(
    userId: string,
    profile: {
      age: number;
      gender: string;
      occupation: string;
      education?: string;
      religion?: string;
      city: string;
      province: string;
      address?: string;
    },
  ): Promise<void> {
    // Validate profile fields
    const validation = isValidProfile(profile);
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
        age: profile.age,
        gender: profile.gender as Gender,
        occupation: profile.occupation,
        education: profile.education ?? null,
        religion: profile.religion ?? null,
        city: profile.city,
        province: profile.province,
        address: profile.address ?? null,
      });
    } else {
      userProfile = this.userProfileRepository.create({
        userId,
        age: profile.age,
        gender: profile.gender as Gender,
        occupation: profile.occupation,
        education: profile.education ?? null,
        religion: profile.religion ?? null,
        city: profile.city,
        province: profile.province,
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
  private async storeSession(
    user: User,
    sessionId: string,
    refreshToken: string,
  ): Promise<void> {
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
      this.jwtService.signAsync(accessPayload as any, {
        expiresIn: this.configService.get<string>('auth.jwtAccessExpiresIn') ?? '15m',
      } as any),
      this.jwtService.signAsync(refreshPayload as any, {
        expiresIn: this.configService.get<string>('auth.jwtRefreshExpiresIn') ?? '7d',
      } as any),
    ]);

    return { accessToken, refreshToken };
  }
}
