import { UserRole } from '@shared/enums';

export interface RegistrationResult {
  userId: string;
  email: string;
  message: string;
  /** True bila akun perlu verifikasi OTP sebelum aktif (alur baru). */
  requiresOtp: boolean;
  accessToken?: string;
  refreshToken?: string;
  user?: {
    id: string;
    email: string;
    fullName: string;
    role: UserRole;
  };
}

export interface OtpResult {
  message: string;
  expiresInMinutes: number;
}

export interface VerificationResult {
  userId: string;
  email: string;
  emailVerified: boolean;
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: UserRole;
  };
}

export interface OtpData {
  code: string;
  attemptCount: number;
  resendCount: number;
  createdAt: string;
}
