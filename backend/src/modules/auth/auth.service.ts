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
import {
  AuthResult,
  TokenPair,
  SessionInfo,
  JwtPayload,
} from './interfaces';

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
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
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
    // Always return void to avoid email enumeration attacks
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      // Silently return to prevent revealing whether email exists
      return;
    }

    // Generate a secure random token
    const token = crypto.randomBytes(32).toString('hex');

    // Store token in Redis with 1-hour TTL, mapping to user's email
    await this.cacheManager.set(
      `${PASSWORD_RESET_PREFIX}${token}`,
      email,
      PASSWORD_RESET_TTL * 1000, // cache-manager expects ms
    );

    // In production, send the reset link via NotificationService email.
    // Token is intentionally NOT logged to prevent credential leakage in log files.
    this.logger.log(`Password reset token issued for ${email}`);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    // Validate password format
    if (!this.isValidPassword(newPassword)) {
      throw new BadRequestException(
        'Password must be at least 8 characters, contain at least 1 uppercase letter and at least 1 digit',
      );
    }

    // Look up the token in Redis
    const email = await this.cacheManager.get<string>(
      `${PASSWORD_RESET_PREFIX}${token}`,
    );
    if (!email) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    // Find the user by email
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    // Hash the new password and update
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    await this.userRepository.update(user.id, { passwordHash });

    // Invalidate the token so it can't be reused
    await this.cacheManager.del(`${PASSWORD_RESET_PREFIX}${token}`);

    this.logger.log(`Password reset completed for ${email}`);
  }

  private isValidPassword(password: string): boolean {
    if (password.length < 8) return false;
    if (!/[A-Z]/.test(password)) return false;
    if (!/[a-z]/.test(password)) return false;
    if (!/\d/.test(password)) return false;
    if (!/[^A-Za-z0-9]/.test(password)) return false; // at least one symbol
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
