export interface EmailPayload {
  to: string;
  subject: string;
  template: EmailTemplate;
  context: Record<string, any>;
}

export enum EmailTemplate {
  SURVEY_INVITATION = 'survey_invitation',
  REMINDER_H3 = 'reminder_h3',
  REMINDER_H1 = 'reminder_h1',
  SUBMISSION_CONFIRMATION = 'submission_confirmation',
  POINTS_THRESHOLD = 'points_threshold',
  REDEMPTION_CONFIRMATION = 'redemption_confirmation',
  OTP_VERIFICATION = 'otp_verification',
  PASSWORD_RESET = 'password_reset',
}

export interface EmailJobData {
  payload: EmailPayload;
  attemptNumber?: number;
}

export interface BulkEmailJobData {
  payloads: EmailPayload[];
  batchId: string;
}

export interface NotificationResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface SurveyInvitationContext {
  respondentName: string;
  surveyTitle: string;
  surveyDescription?: string;
  deadline: string;
  surveyUrl: string;
  rewardInfo?: string;
}

export interface ReminderContext {
  respondentName: string;
  surveyTitle: string;
  daysRemaining: number;
  deadline: string;
  surveyUrl: string;
}

export interface SubmissionConfirmationContext {
  respondentName: string;
  surveyTitle: string;
  submittedAt: string;
  pointsEarned?: number;
}

export interface PointsThresholdContext {
  respondentName: string;
  currentBalance: number;
  threshold: number;
  redeemUrl: string;
}

export interface RedemptionConfirmationContext {
  respondentName: string;
  rewardType: string;
  pointsSpent: number;
  destinationNumber: string;
  remainingBalance: number;
}

export interface OtpContext {
  recipientName: string;
  otpCode: string;
  expiresInMinutes: number;
  /** 'verify' = verifikasi pendaftaran (default), 'reset' = reset password,
   *  'redeem' = konfirmasi penukaran reward. */
  purpose?: 'verify' | 'reset' | 'redeem';
}

export interface PasswordResetContext {
  recipientName: string;
  resetLink: string;
  expiresInHours: number;
}
