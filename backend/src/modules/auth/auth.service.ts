import { Injectable, UnauthorizedException, BadRequestException, Inject, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { User, UserStatus } from './entities';
import { UserProfile } from '@modules/registration/entities/user-profile.entity';
import { UserRole } from '@shared/enums';
import { NotificationService } from '@modules/notification';
import {
  AuthResult,
  TokenPair,
  SessionInfo,
  JwtPayload,
} from './interfaces';

export interface ProfileResult {
  id: string;
  email: string;
  phone: string;
  fullName: string;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
  profileCompleted: boolean;
  createdAt: Date;
  /**
   * Data demografi (variabel pembobot) — read-only di sisi responden. Disertakan
   * agar profil bisa menampilkannya, tapi tidak boleh diubah responden sendiri
   * demi menjaga konsistensi pembobot & mencegah manipulasi targeting.
   */
  demographics?: {
    dateOfBirth: string | null;
    age: number | null;
    gender: string | null;
    education: string | null;
    occupation: string | null;
    religion: string | null;
    province: string | null;
    city: string | null;
    district: string | null;
  } | null;
}

const GENERIC_LOGIN_ERROR = 'Invalid email or password';
const PASSWORD_RESET_TTL = 3600; // 1 hour in seconds
const PASSWORD_RESET_PREFIX = 'password-reset:';
const BCRYPT_SALT_ROUNDS = 10;

// --- Brute-force protection ---
const LOGIN_ATTEMPTS_PREFIX = 'login-attempts:';
const MAX_FAILED_ATTEMPTS = Number(process.env.LOGIN_MAX_FAILED_ATTEMPTS ?? 5);
const LOCKOUT_TTL_SECONDS = Number(process.env.LOGIN_LOCKOUT_SECONDS ?? 900); // 15 min
const LOCKOUT_ERROR =
  'Terlalu banyak percobaan login yang gagal. Silakan coba lagi nanti.';

// A short list of obviously weak passwords that must be rejected outright.
const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  'qwerty123',
  'admin123',
  '12345678',
  'iloveyou',
]);

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

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

  async login(email: string, password: string): Promise<AuthResult> {
    // Block before doing any work if this account is locked out.
    await this.assertNotLockedOut(email);

    // Find user by email
    const user = await this.userRepository.findOne({ where: { email } });

    if (!user) {
      await this.registerFailedLogin(email);
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }

    // Check if account is active
    if (user.status !== UserStatus.ACTIVE) {
      // Count this as a failed attempt too, to avoid status-based probing.
      await this.registerFailedLogin(email);
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }

    // Validate password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      await this.registerFailedLogin(email);
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }

    // Successful login — clear the failed-attempt counter.
    await this.clearFailedLogins(email);

    // Create session
    const sessionId = uuidv4();
    const tokenPair = await this.generateTokenPair(user, sessionId);

    // Store session in Redis
    const sessionTtl = this.configService.get<number>('auth.sessionTtl') ?? 86400;
    await this.cacheManager.set(
      this.getSessionKey(sessionId),
      JSON.stringify({
        userId: user.id,
        email: user.email,
        role: user.role,
        createdAt: new Date().toISOString(),
      }),
      sessionTtl * 1000, // cache-manager expects ms
    );

    // Store refresh token mapping
    await this.cacheManager.set(
      this.getRefreshTokenKey(sessionId),
      tokenPair.refreshToken,
      sessionTtl * 1000,
    );

    return {
      ...tokenPair,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }

  async logout(sessionId: string): Promise<void> {
    // Invalidate session in Redis
    await this.cacheManager.del(this.getSessionKey(sessionId));
    await this.cacheManager.del(this.getRefreshTokenKey(sessionId));
  }

  async refreshToken(refreshToken: string): Promise<TokenPair> {
    // Verify the refresh token
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('auth.jwtSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Check if session still exists in Redis
    const sessionData = await this.cacheManager.get<string>(
      this.getSessionKey(payload.sessionId),
    );
    if (!sessionData) {
      throw new UnauthorizedException('Session expired');
    }

    // Verify the stored refresh token matches
    const storedRefreshToken = await this.cacheManager.get<string>(
      this.getRefreshTokenKey(payload.sessionId),
    );
    if (storedRefreshToken !== refreshToken) {
      // Possible token reuse attack - invalidate session
      await this.logout(payload.sessionId);
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Find user to ensure they still exist and are active
    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      await this.logout(payload.sessionId);
      throw new UnauthorizedException('User account is no longer active');
    }

    // Generate new token pair (token rotation)
    const newTokenPair = await this.generateTokenPair(user, payload.sessionId);

    // Update stored refresh token
    const sessionTtl = this.configService.get<number>('auth.sessionTtl') ?? 86400;
    await this.cacheManager.set(
      this.getRefreshTokenKey(payload.sessionId),
      newTokenPair.refreshToken,
      sessionTtl * 1000,
    );

    return newTokenPair;
  }

  async validateSession(token: string): Promise<SessionInfo> {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token, {
        secret: this.configService.get<string>('auth.jwtSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    // Check if session still exists in Redis (not logged out)
    const sessionData = await this.cacheManager.get<string>(
      this.getSessionKey(payload.sessionId),
    );
    if (!sessionData) {
      throw new UnauthorizedException('Session expired or invalidated');
    }

    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      sessionId: payload.sessionId,
    };
  }

  async requestPasswordReset(email: string): Promise<void> {
    // Selalu return void untuk mencegah email enumeration.
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      return;
    }

    // OTP 6 digit untuk reset (sejalan dengan verifikasi pendaftaran).
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');

    // Simpan OTP per-email di Redis dengan TTL.
    await this.cacheManager.set(
      `${PASSWORD_RESET_PREFIX}${email}`,
      code,
      PASSWORD_RESET_TTL * 1000, // cache-manager expects ms
    );

    // Kirim OTP via email (Resend). OTP TIDAK di-log demi keamanan.
    await this.notificationService.sendOtpEmail(
      email,
      user.fullName,
      code,
      Math.round(PASSWORD_RESET_TTL / 60),
      'reset',
    );
    this.logger.log(`Password reset OTP issued for ${email}`);
  }

  async resetPassword(
    email: string,
    code: string,
    newPassword: string,
  ): Promise<void> {
    // Validate password format
    if (!this.isValidPassword(newPassword)) {
      throw new BadRequestException(
        'Password must be at least 8 characters, contain at least 1 uppercase letter and at least 1 digit',
      );
    }

    // Cocokkan OTP dari Redis.
    const storedCode = await this.cacheManager.get<string>(
      `${PASSWORD_RESET_PREFIX}${email}`,
    );
    if (!storedCode || storedCode !== code) {
      throw new BadRequestException('Kode OTP salah atau sudah kedaluwarsa');
    }

    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      throw new BadRequestException('Kode OTP salah atau sudah kedaluwarsa');
    }

    // Hash the new password and update
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    await this.userRepository.update(user.id, { passwordHash });

    // Invalidate the OTP so it can't be reused
    await this.cacheManager.del(`${PASSWORD_RESET_PREFIX}${email}`);

    this.logger.log(`Password reset completed for ${email}`);
  }

  // --- Profil sendiri (semua user yang login) ---

  /** Data profil user yang sedang login (tanpa hash password). */
  async getProfile(userId: string): Promise<ProfileResult> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    const profile = await this.userProfileRepository.findOne({ where: { userId } });
    return {
      ...this.toProfile(user),
      demographics: profile
        ? {
            dateOfBirth: profile.dateOfBirth ?? null,
            age: profile.age ?? null,
            gender: profile.gender ?? null,
            education: profile.education ?? null,
            occupation: profile.occupation ?? null,
            religion: profile.religion ?? null,
            province: profile.province ?? null,
            city: profile.city ?? null,
            district: profile.district ?? null,
          }
        : null,
    };
  }

  /** Edit data diri sendiri: fullName, phone, email (cek keunikan email & phone). */
  async updateProfile(
    userId: string,
    dto: { fullName?: string; phone?: string; email?: string },
  ): Promise<ProfileResult> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const updates: Partial<User> = {};

    if (dto.fullName !== undefined) {
      updates.fullName = dto.fullName.trim();
    }

    if (dto.phone !== undefined && dto.phone !== user.phone) {
      const existing = await this.userRepository.findOne({ where: { phone: dto.phone } });
      if (existing && existing.id !== userId) {
        throw new BadRequestException('Nomor telepon sudah dipakai akun lain');
      }
      updates.phone = dto.phone;
    }

    if (dto.email !== undefined && dto.email !== user.email) {
      const existing = await this.userRepository.findOne({ where: { email: dto.email } });
      if (existing && existing.id !== userId) {
        throw new BadRequestException('Email sudah dipakai akun lain');
      }
      updates.email = dto.email;
    }

    if (Object.keys(updates).length > 0) {
      await this.userRepository.update(userId, updates);
    }

    const refreshed = await this.userRepository.findOne({ where: { id: userId } });
    return this.toProfile(refreshed ?? user);
  }

  /** Ganti password sendiri — wajib verifikasi password lama. */
  async changeOwnPassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) {
      throw new BadRequestException('Password lama salah');
    }

    if (!this.isValidPassword(newPassword)) {
      throw new BadRequestException(
        'Password baru minimal 8 karakter, mengandung huruf besar dan angka',
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    await this.userRepository.update(userId, { passwordHash });
    this.logger.log(`Password changed by user ${user.email}`);
  }

  private toProfile(user: User): ProfileResult {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
      emailVerified: user.emailVerified,
      profileCompleted: user.profileCompleted,
      createdAt: user.createdAt,
    };
  }

  private isValidPassword(password: string): boolean {
    // Kebijakan SAMA dengan registrasi (registration.validators.isValidPassword):
    // min 8 karakter, ≥1 huruf besar, ≥1 angka. Sengaja TIDAK mewajibkan simbol
    // atau huruf kecil agar konsisten — pengguna bisa mereset ke jenis password
    // yang sama seperti saat mendaftar (mencegah penolakan yang membingungkan).
    if (password.length < 8) return false;
    if (!/[A-Z]/.test(password)) return false;
    if (!/\d/.test(password)) return false;
    // Lapisan tambahan: tolak password yang terlalu umum.
    if (COMMON_PASSWORDS.has(password.toLowerCase())) return false;
    return true;
  }

  // --- Brute-force protection helpers ---

  private getLoginAttemptsKey(email: string): string {
    return `${LOGIN_ATTEMPTS_PREFIX}${email.toLowerCase()}`;
  }

  /**
   * Throws if the account has reached the failed-attempt limit and is still
   * within the lockout window. Keyed on the submitted email so it does not
   * reveal whether the account actually exists.
   */
  private async assertNotLockedOut(email: string): Promise<void> {
    const attempts = await this.cacheManager.get<number>(
      this.getLoginAttemptsKey(email),
    );
    if (attempts !== undefined && attempts !== null && attempts >= MAX_FAILED_ATTEMPTS) {
      throw new UnauthorizedException(LOCKOUT_ERROR);
    }
  }

  /**
   * Increment the failed-attempt counter for an email, refreshing the lockout
   * TTL on each failure.
   */
  private async registerFailedLogin(email: string): Promise<void> {
    const key = this.getLoginAttemptsKey(email);
    const current = (await this.cacheManager.get<number>(key)) ?? 0;
    const next = current + 1;
    await this.cacheManager.set(key, next, LOCKOUT_TTL_SECONDS * 1000);
    if (next >= MAX_FAILED_ATTEMPTS) {
      this.logger.warn(
        `Account locked due to ${next} failed login attempts: ${email}`,
      );
    }
  }

  private async clearFailedLogins(email: string): Promise<void> {
    await this.cacheManager.del(this.getLoginAttemptsKey(email));
  }

  private async generateTokenPair(
    user: User,
    sessionId: string,
  ): Promise<TokenPair> {
    const accessPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionId,
      type: 'access',
    };

    const refreshPayload: JwtPayload = {
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

  private getSessionKey(sessionId: string): string {
    return `session:${sessionId}`;
  }

  private getRefreshTokenKey(sessionId: string): string {
    return `refresh:${sessionId}`;
  }
}
