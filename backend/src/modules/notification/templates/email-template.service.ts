import { Injectable } from '@nestjs/common';
import {
  EmailTemplate,
  SurveyInvitationContext,
  ReminderContext,
  SubmissionConfirmationContext,
  PointsThresholdContext,
  RedemptionConfirmationContext,
  OtpContext,
  PasswordResetContext,
} from '../interfaces';

@Injectable()
export class EmailTemplateService {
  renderTemplate(template: EmailTemplate, context: Record<string, any>): { subject: string; html: string; text: string } {
    switch (template) {
      case EmailTemplate.SURVEY_INVITATION:
        return this.renderSurveyInvitation(context as SurveyInvitationContext);
      case EmailTemplate.REMINDER_H3:
        return this.renderReminder(context as ReminderContext, 3);
      case EmailTemplate.REMINDER_H1:
        return this.renderReminder(context as ReminderContext, 1);
      case EmailTemplate.SUBMISSION_CONFIRMATION:
        return this.renderSubmissionConfirmation(context as SubmissionConfirmationContext);
      case EmailTemplate.POINTS_THRESHOLD:
        return this.renderPointsThreshold(context as PointsThresholdContext);
      case EmailTemplate.REDEMPTION_CONFIRMATION:
        return this.renderRedemptionConfirmation(context as RedemptionConfirmationContext);
      case EmailTemplate.OTP_VERIFICATION:
        return this.renderOtp(context as OtpContext);
      case EmailTemplate.PASSWORD_RESET:
        return this.renderPasswordReset(context as PasswordResetContext);
      default:
        throw new Error(`Unknown email template: ${template}`);
    }
  }

  private renderSurveyInvitation(context: SurveyInvitationContext) {
    const subject = `Undangan Survei: ${context.surveyTitle}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Halo ${context.respondentName},</h2>
        <p>Anda diundang untuk mengisi survei baru:</p>
        <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <h3 style="margin: 0 0 8px 0;">${context.surveyTitle}</h3>
          ${context.surveyDescription ? `<p style="margin: 0 0 8px 0;">${context.surveyDescription}</p>` : ''}
          <p style="margin: 0; color: #666;">Deadline: ${context.deadline}</p>
          ${context.rewardInfo ? `<p style="margin: 8px 0 0 0; color: #2e7d32;">🎁 ${context.rewardInfo}</p>` : ''}
        </div>
        <a href="${context.surveyUrl}" style="display: inline-block; background: #1976d2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">Isi Survei Sekarang</a>
        <p style="color: #666; margin-top: 24px; font-size: 12px;">Jika Anda tidak ingin menerima email ini, silakan abaikan.</p>
      </div>
    `;
    const text = `Halo ${context.respondentName}, Anda diundang untuk mengisi survei "${context.surveyTitle}". Deadline: ${context.deadline}. Kunjungi: ${context.surveyUrl}`;
    return { subject, html, text };
  }

  private renderReminder(context: ReminderContext, daysRemaining: number) {
    const subject = `Pengingat: Survei "${context.surveyTitle}" berakhir dalam ${daysRemaining} hari`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Halo ${context.respondentName},</h2>
        <p>Ini adalah pengingat bahwa survei berikut akan berakhir dalam <strong>${daysRemaining} hari</strong>:</p>
        <div style="background: #fff3e0; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #ff9800;">
          <h3 style="margin: 0 0 8px 0;">${context.surveyTitle}</h3>
          <p style="margin: 0; color: #666;">Deadline: ${context.deadline}</p>
        </div>
        <a href="${context.surveyUrl}" style="display: inline-block; background: #ff9800; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">Isi Survei Sekarang</a>
        <p style="color: #666; margin-top: 24px; font-size: 12px;">Jangan lewatkan kesempatan untuk mendapatkan reward!</p>
      </div>
    `;
    const text = `Halo ${context.respondentName}, pengingat: survei "${context.surveyTitle}" berakhir dalam ${daysRemaining} hari (${context.deadline}). Kunjungi: ${context.surveyUrl}`;
    return { subject, html, text };
  }

  private renderSubmissionConfirmation(context: SubmissionConfirmationContext) {
    const subject = `Konfirmasi: Respons survei "${context.surveyTitle}" berhasil dikirim`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Halo ${context.respondentName},</h2>
        <p>Terima kasih! Respons Anda untuk survei berikut telah berhasil dikirim:</p>
        <div style="background: #e8f5e9; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #4caf50;">
          <h3 style="margin: 0 0 8px 0;">${context.surveyTitle}</h3>
          <p style="margin: 0; color: #666;">Dikirim pada: ${context.submittedAt}</p>
          ${context.pointsEarned ? `<p style="margin: 8px 0 0 0; color: #2e7d32;">🎉 Anda mendapatkan ${context.pointsEarned.toLocaleString()} poin!</p>` : ''}
        </div>
      </div>
    `;
    const text = `Halo ${context.respondentName}, respons Anda untuk survei "${context.surveyTitle}" berhasil dikirim pada ${context.submittedAt}.${context.pointsEarned ? ` Anda mendapatkan ${context.pointsEarned} poin!` : ''}`;
    return { subject, html, text };
  }

  private renderPointsThreshold(context: PointsThresholdContext) {
    const subject = `Selamat! Saldo poin Anda sudah mencapai ${context.threshold.toLocaleString()} poin`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Halo ${context.respondentName},</h2>
        <p>Selamat! Saldo poin Anda telah mencapai threshold minimum penukaran:</p>
        <div style="background: #e3f2fd; padding: 16px; border-radius: 8px; margin: 16px 0; text-align: center;">
          <p style="font-size: 32px; font-weight: bold; margin: 0; color: #1976d2;">${context.currentBalance.toLocaleString()} Poin</p>
          <p style="margin: 8px 0 0 0; color: #666;">Minimum penukaran: ${context.threshold.toLocaleString()} poin</p>
        </div>
        <p>Anda sekarang dapat menukarkan poin dengan pulsa, paket data, voucher, atau e-wallet!</p>
        <a href="${context.redeemUrl}" style="display: inline-block; background: #4caf50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">Tukarkan Poin</a>
      </div>
    `;
    const text = `Halo ${context.respondentName}, saldo poin Anda sudah ${context.currentBalance} poin (minimum penukaran: ${context.threshold} poin). Tukarkan sekarang di: ${context.redeemUrl}`;
    return { subject, html, text };
  }

  private renderRedemptionConfirmation(context: RedemptionConfirmationContext) {
    const subject = `Konfirmasi Penukaran Reward: ${context.rewardType}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Halo ${context.respondentName},</h2>
        <p>Penukaran reward Anda telah berhasil diproses:</p>
        <div style="background: #e8f5e9; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 4px 0; color: #666;">Tipe Reward:</td><td style="padding: 4px 0; font-weight: bold;">${context.rewardType}</td></tr>
            <tr><td style="padding: 4px 0; color: #666;">Poin Digunakan:</td><td style="padding: 4px 0; font-weight: bold;">${context.pointsSpent.toLocaleString()}</td></tr>
            <tr><td style="padding: 4px 0; color: #666;">Nomor Tujuan:</td><td style="padding: 4px 0; font-weight: bold;">${context.destinationNumber}</td></tr>
            <tr><td style="padding: 4px 0; color: #666;">Sisa Saldo:</td><td style="padding: 4px 0; font-weight: bold;">${context.remainingBalance.toLocaleString()} poin</td></tr>
          </table>
        </div>
        <p style="color: #666; font-size: 12px;">Reward akan diproses dalam 1x24 jam.</p>
      </div>
    `;
    const text = `Halo ${context.respondentName}, penukaran ${context.rewardType} (${context.pointsSpent} poin) ke ${context.destinationNumber} berhasil. Sisa saldo: ${context.remainingBalance} poin.`;
    return { subject, html, text };
  }

  private renderOtp(context: OtpContext) {
    const subject = `Kode Verifikasi OTP Anda: ${context.otpCode}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Halo ${context.recipientName},</h2>
        <p>Berikut adalah kode verifikasi OTP Anda:</p>
        <div style="background: #f5f5f5; padding: 24px; border-radius: 8px; margin: 16px 0; text-align: center;">
          <p style="font-size: 36px; font-weight: bold; letter-spacing: 8px; margin: 0; color: #1976d2;">${context.otpCode}</p>
        </div>
        <p style="color: #666;">Kode ini berlaku selama <strong>${context.expiresInMinutes} menit</strong>.</p>
        <p style="color: #d32f2f; font-size: 12px;">Jangan bagikan kode ini kepada siapapun.</p>
      </div>
    `;
    const text = `Halo ${context.recipientName}, kode OTP Anda: ${context.otpCode}. Berlaku ${context.expiresInMinutes} menit. Jangan bagikan kode ini.`;
    return { subject, html, text };
  }

  private renderPasswordReset(context: PasswordResetContext) {
    const subject = 'Reset Kata Sandi Anda';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Halo ${context.recipientName},</h2>
        <p>Kami menerima permintaan untuk mereset kata sandi akun Anda. Klik tombol di bawah untuk membuat kata sandi baru:</p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${context.resetLink}" style="display: inline-block; background: #1976d2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">Reset Kata Sandi</a>
        </div>
        <p style="color: #666;">Link ini berlaku selama <strong>${context.expiresInHours} jam</strong>.</p>
        <p style="color: #666; font-size: 12px;">Jika Anda tidak meminta reset kata sandi, abaikan email ini.</p>
      </div>
    `;
    const text = `Halo ${context.recipientName}, kunjungi link berikut untuk reset kata sandi: ${context.resetLink}. Berlaku ${context.expiresInHours} jam.`;
    return { subject, html, text };
  }
}
