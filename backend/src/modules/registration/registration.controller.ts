import { AuthenticatedRequest } from '@modules/auth/interfaces';
import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards, Request } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RegistrationService } from './registration.service';
import {
  RegisterDto,
  VerifyOtpDto,
  ResendOtpDto,
  CompleteProfileDto,
  CheckAvailabilityDto,
} from './dto';
import { JwtAuthGuard } from '@modules/auth/guards';
import { Public } from '@modules/auth/decorators';
import { RegistrationResult, OtpResult, VerificationResult } from './interfaces';

@Controller('registration')
export class RegistrationController {
  constructor(private readonly registrationService: RegistrationService) {}

  /**
   * New account registration.
   * Throttle: 5 requests/minute per IP — prevents mass account creation.
   */
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async register(@Body() registerDto: RegisterDto): Promise<RegistrationResult> {
    return this.registrationService.register({
      fullName: registerDto.fullName,
      email: registerDto.email,
      phone: registerDto.phone,
      password: registerDto.password,
      termsAccepted: registerDto.termsAccepted,
      dateOfBirth: registerDto.dateOfBirth,
      age: registerDto.age,
      gender: registerDto.gender,
      occupation: registerDto.occupation,
      education: registerDto.education,
      religion: registerDto.religion,
      city: registerDto.city,
      province: registerDto.province,
      district: registerDto.district,
      address: registerDto.address,
    });
  }

  /**
   * Cek dini ketersediaan email & telepon (langkah 1). Agar user tak mengisi
   * seluruh langkah 2 hanya untuk ditolak. Throttle longgar (endpoint ringan)
   * tapi tetap dibatasi untuk mengurangi enumerasi.
   */
  @Public()
  @Post('check-availability')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async checkAvailability(
    @Body() dto: CheckAvailabilityDto,
  ): Promise<{ emailTaken: boolean; phoneTaken: boolean }> {
    return this.registrationService.checkAvailability(dto.email, dto.phone);
  }

  /**
   * OTP verification.
   * Throttle: 5 requests/minute per IP — limits brute-force guessing (10^6 space ÷ 5/min = impractical).
   */
  @Public()
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto): Promise<VerificationResult> {
    return this.registrationService.verifyOtp(verifyOtpDto.email, verifyOtpDto.code);
  }

  /**
   * OTP resend.
   * Throttle: 3 requests/minute per IP — stricter than verify because resend
   * triggers email delivery and can be abused for email flooding.
   */
  @Public()
  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  async resendOtp(@Body() resendOtpDto: ResendOtpDto): Promise<OtpResult> {
    return this.registrationService.resendOtp(resendOtpDto.email);
  }

  @Post('complete-profile')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async completeProfile(
    @Request() req: AuthenticatedRequest,
    @Body() completeProfileDto: CompleteProfileDto,
  ): Promise<{ message: string }> {
    await this.registrationService.completeProfile(req.user.userId, {
      dateOfBirth: completeProfileDto.dateOfBirth,
      age: completeProfileDto.age,
      gender: completeProfileDto.gender,
      occupation: completeProfileDto.occupation,
      education: completeProfileDto.education,
      religion: completeProfileDto.religion,
      city: completeProfileDto.city,
      province: completeProfileDto.province,
      district: completeProfileDto.district,
      address: completeProfileDto.address,
    });
    return { message: 'Profile completed and account activated' };
  }
}
