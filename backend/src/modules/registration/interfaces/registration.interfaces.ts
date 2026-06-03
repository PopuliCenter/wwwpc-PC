export interface RegistrationResult {
  userId: string;
  email: string;
  message: string;
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
