import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService, ProfileResult } from './auth.service';
import {
  LoginDto,
  RefreshTokenDto,
  RequestPasswordResetDto,
  ResetPasswordDto,
  UpdateProfileDto,
  ChangePasswordDto,
  SetPasswordDto,
  GoogleLoginDto,
} from './dto';
import { JwtAuthGuard } from './guards';
import { AuthResult, TokenPair } from './interfaces';
import { AuditService } from '@modules/audit/audit.service';
import { AuditActionType } from '@shared/enums';

/** Ambil IP klien dari request (hormati proxy bila ada). */
function clientIp(req: any): string {
  return (
    (req?.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req?.ip ||
    'unknown'
  );
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly auditService: AuditService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async login(@Body() loginDto: LoginDto, @Request() req: any): Promise<AuthResult> {
    const result = await this.authService.login(loginDto.email, loginDto.password);
    await this.auditService.log({
      userId: result.user.id,
      actionType: AuditActionType.LOGIN,
      module: 'auth',
      details: { email: result.user.email, role: result.user.role },
      ipAddress: clientIp(req),
    });
    return result;
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async googleLogin(
    @Body() dto: GoogleLoginDto,
    @Request() req: any,
  ): Promise<AuthResult> {
    const result = await this.authService.loginWithGoogle(dto.idToken);
    await this.auditService.log({
      userId: result.user.id,
      actionType: AuditActionType.LOGIN,
      module: 'auth',
      details: { email: result.user.email, role: result.user.role, via: 'google' },
      ipAddress: clientIp(req),
    });
    return result;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async logout(@Request() req: any): Promise<void> {
    await this.authService.logout(req.user.sessionId);
    await this.auditService.log({
      userId: req.user.userId,
      actionType: AuditActionType.LOGOUT,
      module: 'auth',
      ipAddress: clientIp(req),
    });
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async refresh(@Body() refreshTokenDto: RefreshTokenDto): Promise<TokenPair> {
    return this.authService.refreshToken(refreshTokenDto.refreshToken);
  }

  @Post('password-reset/request')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async requestPasswordReset(
    @Body() dto: RequestPasswordResetDto,
  ): Promise<void> {
    await this.authService.requestPasswordReset(dto.email);
  }

  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.authService.resetPassword(dto.email, dto.code, dto.newPassword);
  }

  // --- Profil sendiri (semua user yang login) ---

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Request() req: any): Promise<ProfileResult> {
    return this.authService.getProfile(req.user.userId);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @Request() req: any,
    @Body() dto: UpdateProfileDto,
  ): Promise<ProfileResult> {
    const result = await this.authService.updateProfile(req.user.userId, dto);
    // Catat perubahan data diri (lewati bila hanya ganti avatar agar tak berisik).
    const fields = Object.keys(dto ?? {});
    if (fields.some((f) => f !== 'avatarUrl')) {
      await this.auditService.log({
        userId: req.user.userId,
        actionType: AuditActionType.USER_UPDATE,
        module: 'auth',
        details: { self: true, fields },
        ipAddress: clientIp(req),
      });
    }
    return result;
  }

  @Patch('profile/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @Request() req: any,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.authService.changeOwnPassword(
      req.user.userId,
      dto.currentPassword,
      dto.newPassword,
    );
    await this.auditService.log({
      userId: req.user.userId,
      actionType: AuditActionType.USER_PASSWORD_RESET,
      module: 'auth',
      details: { self: true, kind: 'change' },
      ipAddress: clientIp(req),
    });
  }

  /** Buat password (akun tanpa password, mis. dibuat via Google). Tanpa pw lama. */
  @Patch('profile/set-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async setPassword(
    @Request() req: any,
    @Body() dto: SetPasswordDto,
  ): Promise<void> {
    await this.authService.setPasswordWithoutOld(req.user.userId, dto.newPassword);
    await this.auditService.log({
      userId: req.user.userId,
      actionType: AuditActionType.USER_PASSWORD_RESET,
      module: 'auth',
      details: { self: true, kind: 'set' },
      ipAddress: clientIp(req),
    });
  }
}
