import { UserRole } from '@shared/enums';

export interface RegistrationResult {
  userId: string;
  email: string;
  message: string;
  accessToken: string;
  refreshToken: string;
  user: {
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
}

export interface OtpData {
  code: string;
  attemptCount: number;
  resendCount: number;
  createdAt: string;
}
