import { describe, it, expect, beforeEach } from 'vitest';
import { EmailTemplateService } from './email-template.service';
import { EmailTemplate } from '../interfaces';

describe('EmailTemplateService', () => {
  let service: EmailTemplateService;

  beforeEach(() => {
    service = new EmailTemplateService();
  });

  describe('renderTemplate', () => {
    it('should throw error for unknown template', () => {
      expect(() => service.renderTemplate('unknown' as EmailTemplate, {})).toThrow(
        'Unknown email template',
      );
    });
  });

  describe('SURVEY_INVITATION template', () => {
    it('should render survey invitation with all fields', () => {
      const result = service.renderTemplate(EmailTemplate.SURVEY_INVITATION, {
        respondentName: 'John',
        surveyTitle: 'Customer Satisfaction',
        surveyDescription: 'Help us improve',
        deadline: '2026-06-01',
        surveyUrl: 'https://app.test/surveys/1/fill',
        rewardInfo: '5000 poin',
      });

      expect(result.subject).toContain('Customer Satisfaction');
      expect(result.html).toContain('John');
      expect(result.html).toContain('Customer Satisfaction');
      expect(result.html).toContain('Help us improve');
      expect(result.html).toContain('2026-06-01');
      expect(result.html).toContain('https://app.test/surveys/1/fill');
      expect(result.html).toContain('5000 poin');
      expect(result.text).toContain('John');
      expect(result.text).toContain('Customer Satisfaction');
    });

    it('should render without optional fields', () => {
      const result = service.renderTemplate(EmailTemplate.SURVEY_INVITATION, {
        respondentName: 'John',
        surveyTitle: 'Survey',
        deadline: '2026-06-01',
        surveyUrl: 'https://app.test/surveys/1/fill',
      });

      expect(result.subject).toContain('Survey');
      expect(result.html).toContain('John');
      expect(result.html).not.toContain('undefined');
    });
  });

  describe('REMINDER templates', () => {
    it('should render H-3 reminder', () => {
      const result = service.renderTemplate(EmailTemplate.REMINDER_H3, {
        respondentName: 'Jane',
        surveyTitle: 'Survey X',
        daysRemaining: 3,
        deadline: '2026-06-01',
        surveyUrl: 'https://app.test/surveys/1/fill',
      });

      expect(result.subject).toContain('3 hari');
      expect(result.html).toContain('Jane');
      expect(result.html).toContain('3 hari');
      expect(result.html).toContain('Survey X');
    });

    it('should render H-1 reminder', () => {
      const result = service.renderTemplate(EmailTemplate.REMINDER_H1, {
        respondentName: 'Jane',
        surveyTitle: 'Survey X',
        daysRemaining: 1,
        deadline: '2026-06-01',
        surveyUrl: 'https://app.test/surveys/1/fill',
      });

      expect(result.subject).toContain('1 hari');
      expect(result.html).toContain('1 hari');
    });
  });

  describe('SUBMISSION_CONFIRMATION template', () => {
    it('should render with points earned', () => {
      const result = service.renderTemplate(EmailTemplate.SUBMISSION_CONFIRMATION, {
        respondentName: 'User',
        surveyTitle: 'Survey',
        submittedAt: '07/05/2026 10:00',
        pointsEarned: 5000,
      });

      expect(result.subject).toContain('Survey');
      expect(result.html).toContain('5.000 poin');
      expect(result.html).toContain('07/05/2026 10:00');
    });

    it('should render without points earned', () => {
      const result = service.renderTemplate(EmailTemplate.SUBMISSION_CONFIRMATION, {
        respondentName: 'User',
        surveyTitle: 'Survey',
        submittedAt: '07/05/2026 10:00',
      });

      expect(result.html).not.toContain('poin');
    });
  });

  describe('POINTS_THRESHOLD template', () => {
    it('should render points threshold notification', () => {
      const result = service.renderTemplate(EmailTemplate.POINTS_THRESHOLD, {
        respondentName: 'User',
        currentBalance: 12000,
        threshold: 10000,
        redeemUrl: 'https://app.test/rewards/redeem',
      });

      expect(result.subject).toContain('10.000');
      expect(result.html).toContain('12.000');
      expect(result.html).toContain('https://app.test/rewards/redeem');
    });
  });

  describe('REDEMPTION_CONFIRMATION template', () => {
    it('should render redemption confirmation', () => {
      const result = service.renderTemplate(EmailTemplate.REDEMPTION_CONFIRMATION, {
        respondentName: 'User',
        rewardType: 'Pulsa Telkomsel',
        pointsSpent: 15000,
        destinationNumber: '08123456789',
        remainingBalance: 5000,
      });

      expect(result.subject).toContain('Pulsa Telkomsel');
      expect(result.html).toContain('15.000');
      expect(result.html).toContain('08123456789');
      expect(result.html).toContain('5.000');
    });
  });

  describe('OTP_VERIFICATION template', () => {
    it('should render OTP email', () => {
      const result = service.renderTemplate(EmailTemplate.OTP_VERIFICATION, {
        recipientName: 'User',
        otpCode: '123456',
        expiresInMinutes: 15,
      });

      // Subjek sengaja TIDAK memuat kode (keamanan/deliverability).
      expect(result.subject).toContain('Verifikasi');
      expect(result.html).toContain('123456');
      expect(result.html).toContain('15 menit');
      expect(result.text).toContain('123456');
    });

    it('should render reset-purpose OTP with reset wording', () => {
      const result = service.renderTemplate(EmailTemplate.OTP_VERIFICATION, {
        recipientName: 'User',
        otpCode: '654321',
        expiresInMinutes: 15,
        purpose: 'reset',
      });

      expect(result.subject).toContain('Reset');
      expect(result.html).toContain('654321');
      expect(result.text.toLowerCase()).toContain('reset');
    });
  });

  describe('PASSWORD_RESET template', () => {
    it('should render password reset email', () => {
      const result = service.renderTemplate(EmailTemplate.PASSWORD_RESET, {
        recipientName: 'User',
        resetLink: 'https://app.test/auth/reset-password?token=abc123',
        expiresInHours: 1,
      });

      expect(result.subject).toContain('Reset Kata Sandi');
      expect(result.html).toContain('https://app.test/auth/reset-password?token=abc123');
      expect(result.html).toContain('1 jam');
    });
  });
});
