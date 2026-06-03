import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { v4 as uuidv4 } from 'uuid';
import {
  EmailPayload,
  EmailTemplate,
  SurveyInvitationContext,
  ReminderContext,
  SubmissionConfirmationContext,
  PointsThresholdContext,
  RedemptionConfirmationContext,
  OtpContext,
  PasswordResetContext,
} from './interfaces';
import {
  NOTIFICATION_QUEUE,
  EMAIL_JOB,
  BULK_EMAIL_JOB,
  EMAIL_RETRY_ATTEMPTS,
  EMAIL_RETRY_DELAY,
  EMAIL_BACKOFF_TYPE,
  POINTS_THRESHOLD,
} from './constants';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectQueue(NOTIFICATION_QUEUE)
    private readonly notificationQueue: Queue,
  ) {}

  /**
   * Send survey invitation emails to all eligible respondents
   */
  async sendSurveyInvitation(
    respondents: Array<{ email: string; fullName: string }>,
    survey: { title: string; description?: string; endDatetime: string; id: string },
    baseUrl: string,
  ): Promise<void> {
    this.logger.log(`Sending survey invitation for "${survey.title}" to ${respondents.length} respondents`);

    const payloads: EmailPayload[] = respondents.map((respondent) => ({
      to: respondent.email,
      subject: `Undangan Survei: ${survey.title}`,
      template: EmailTemplate.SURVEY_INVITATION,
      context: {
        respondentName: respondent.fullName,
        surveyTitle: survey.title,
        surveyDescription: survey.description,
        deadline: survey.endDatetime,
        surveyUrl: `${baseUrl}/surveys/${survey.id}/fill`,
      } as SurveyInvitationContext,
    }));

    // Send in batches for large recipient lists
    const BATCH_SIZE = 50;
    for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
      const batch = payloads.slice(i, i + BATCH_SIZE);
      const batchId = uuidv4();

      await this.notificationQueue.add(
        BULK_EMAIL_JOB,
        { payloads: batch, batchId },
        {
          attempts: EMAIL_RETRY_ATTEMPTS,
          backoff: { type: EMAIL_BACKOFF_TYPE, delay: EMAIL_RETRY_DELAY },
          removeOnComplete: true,
        },
      );
    }

    this.logger.log(`Queued ${payloads.length} invitation emails in ${Math.ceil(payloads.length / BATCH_SIZE)} batches`);
  }

  /**
   * Send reminder emails (H-3 or H-1) to respondents who haven't filled the survey
   */
  async sendReminder(
    respondents: Array<{ email: string; fullName: string }>,
    survey: { title: string; endDatetime: string; id: string },
    daysBeforeDeadline: number,
    baseUrl: string,
  ): Promise<void> {
    const template = daysBeforeDeadline === 3 ? EmailTemplate.REMINDER_H3 : EmailTemplate.REMINDER_H1;
    this.logger.log(`Sending H-${daysBeforeDeadline} reminder for "${survey.title}" to ${respondents.length} respondents`);

    const payloads: EmailPayload[] = respondents.map((respondent) => ({
      to: respondent.email,
      subject: `Pengingat: Survei "${survey.title}" berakhir dalam ${daysBeforeDeadline} hari`,
      template,
      context: {
        respondentName: respondent.fullName,
        surveyTitle: survey.title,
        daysRemaining: daysBeforeDeadline,
        deadline: survey.endDatetime,
        surveyUrl: `${baseUrl}/surveys/${survey.id}/fill`,
      } as ReminderContext,
    }));

    const BATCH_SIZE = 50;
    for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
      const batch = payloads.slice(i, i + BATCH_SIZE);
      const batchId = uuidv4();

      await this.notificationQueue.add(
        BULK_EMAIL_JOB,
        { payloads: batch, batchId },
        {
          attempts: EMAIL_RETRY_ATTEMPTS,
          backoff: { type: EMAIL_BACKOFF_TYPE, delay: EMAIL_RETRY_DELAY },
          removeOnComplete: true,
        },
      );
    }
  }

  /**
   * Send submission confirmation to a respondent
   */
  async sendSubmissionConfirmation(
    respondent: { email: string; fullName: string },
    survey: { title: string },
    submittedAt: Date,
    pointsEarned?: number,
  ): Promise<void> {
    this.logger.log(`Sending submission confirmation to ${respondent.email} for "${survey.title}"`);

    const payload: EmailPayload = {
      to: respondent.email,
      subject: `Konfirmasi: Respons survei "${survey.title}" berhasil dikirim`,
      template: EmailTemplate.SUBMISSION_CONFIRMATION,
      context: {
        respondentName: respondent.fullName,
        surveyTitle: survey.title,
        submittedAt: submittedAt.toLocaleString('id-ID'),
        pointsEarned,
      } as SubmissionConfirmationContext,
    };

    await this.enqueueEmail(payload);
  }

  /**
   * Send points threshold notification when balance reaches minimum redemption
   */
  async sendPointsThresholdNotification(
    respondent: { email: string; fullName: string },
    currentBalance: number,
    baseUrl: string,
  ): Promise<void> {
    this.logger.log(`Sending points threshold notification to ${respondent.email} (balance: ${currentBalance})`);

    const payload: EmailPayload = {
      to: respondent.email,
      subject: `Selamat! Saldo poin Anda sudah mencapai ${POINTS_THRESHOLD.toLocaleString()} poin`,
      template: EmailTemplate.POINTS_THRESHOLD,
      context: {
        respondentName: respondent.fullName,
        currentBalance,
        threshold: POINTS_THRESHOLD,
        redeemUrl: `${baseUrl}/rewards/redeem`,
      } as PointsThresholdContext,
    };

    await this.enqueueEmail(payload);
  }

  /**
   * Send redemption confirmation after successful reward processing
   */
  async sendRedemptionConfirmation(
    respondent: { email: string; fullName: string },
    redemption: {
      rewardType: string;
      pointsSpent: number;
      destinationNumber: string;
      remainingBalance: number;
    },
  ): Promise<void> {
    this.logger.log(`Sending redemption confirmation to ${respondent.email}`);

    const payload: EmailPayload = {
      to: respondent.email,
      subject: `Konfirmasi Penukaran Reward: ${redemption.rewardType}`,
      template: EmailTemplate.REDEMPTION_CONFIRMATION,
      context: {
        respondentName: respondent.fullName,
        rewardType: redemption.rewardType,
        pointsSpent: redemption.pointsSpent,
        destinationNumber: redemption.destinationNumber,
        remainingBalance: redemption.remainingBalance,
      } as RedemptionConfirmationContext,
    };

    await this.enqueueEmail(payload);
  }

  /**
   * Send OTP verification email
   */
  async sendOtpEmail(
    email: string,
    recipientName: string,
    otpCode: string,
    expiresInMinutes: number = 15,
  ): Promise<void> {
    this.logger.log(`Sending OTP email to ${email}`);

    const payload: EmailPayload = {
      to: email,
      subject: `Kode Verifikasi OTP Anda: ${otpCode}`,
      template: EmailTemplate.OTP_VERIFICATION,
      context: {
        recipientName,
        otpCode,
        expiresInMinutes,
      } as OtpContext,
    };

    // OTP emails should be sent with higher priority
    await this.notificationQueue.add(EMAIL_JOB, { payload }, {
      attempts: EMAIL_RETRY_ATTEMPTS,
      backoff: { type: EMAIL_BACKOFF_TYPE, delay: EMAIL_RETRY_DELAY },
      priority: 1, // Higher priority
      removeOnComplete: true,
    });
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(
    email: string,
    recipientName: string,
    resetToken: string,
    baseUrl: string,
    expiresInHours: number = 1,
  ): Promise<void> {
    this.logger.log(`Sending password reset email to ${email}`);

    const payload: EmailPayload = {
      to: email,
      subject: 'Reset Kata Sandi Anda',
      template: EmailTemplate.PASSWORD_RESET,
      context: {
        recipientName,
        resetLink: `${baseUrl}/auth/reset-password?token=${resetToken}`,
        expiresInHours,
      } as PasswordResetContext,
    };

    // Password reset emails should be sent with higher priority
    await this.notificationQueue.add(EMAIL_JOB, { payload }, {
      attempts: EMAIL_RETRY_ATTEMPTS,
      backoff: { type: EMAIL_BACKOFF_TYPE, delay: EMAIL_RETRY_DELAY },
      priority: 1,
      removeOnComplete: true,
    });
  }

  /**
   * Get queue statistics for monitoring
   */
  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.notificationQueue.getWaitingCount(),
      this.notificationQueue.getActiveCount(),
      this.notificationQueue.getCompletedCount(),
      this.notificationQueue.getFailedCount(),
      this.notificationQueue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  /**
   * Enqueue a single email with standard retry configuration
   */
  private async enqueueEmail(payload: EmailPayload): Promise<void> {
    await this.notificationQueue.add(
      EMAIL_JOB,
      { payload },
      {
        attempts: EMAIL_RETRY_ATTEMPTS,
        backoff: { type: EMAIL_BACKOFF_TYPE, delay: EMAIL_RETRY_DELAY },
        removeOnComplete: true,
      },
    );
  }
}
