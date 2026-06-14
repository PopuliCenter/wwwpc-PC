import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bull';
import { EmailTemplateService } from '../templates';
import { EmailJobData, BulkEmailJobData, NotificationResult } from '../interfaces';
import {
  NOTIFICATION_QUEUE,
  EMAIL_JOB,
  BULK_EMAIL_JOB,
} from '../constants';
import { CircuitBreaker } from '@shared/circuit-breaker';

@Processor(NOTIFICATION_QUEUE)
export class EmailProcessor {
  private readonly logger = new Logger(EmailProcessor.name);
  private readonly emailCircuitBreaker: CircuitBreaker;

  constructor(
    private readonly templateService: EmailTemplateService,
    private readonly configService: ConfigService,
  ) {
    this.emailCircuitBreaker = new CircuitBreaker({
      name: 'email-service',
      failureThreshold: 5,
      successThreshold: 3,
      timeout: 30000,
    });
  }

  @Process(EMAIL_JOB)
  async handleSendEmail(job: Job<EmailJobData>): Promise<NotificationResult> {
    const { payload } = job.data;
    this.logger.log(`Processing email job ${job.id} to ${payload.to} (template: ${payload.template})`);

    try {
      const rendered = this.templateService.renderTemplate(payload.template, payload.context);

      await this.emailCircuitBreaker.execute(
        () => this.sendEmail({
          to: payload.to,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        }),
      );

      this.logger.log(`Email sent successfully to ${payload.to} (job ${job.id})`);
      return { success: true, messageId: `msg-${job.id}` };
    } catch (error: any) {
      this.logger.error(`Failed to send email to ${payload.to} (job ${job.id}): ${error.message}`);
      throw error; // Bull will retry based on job options
    }
  }

  @Process(BULK_EMAIL_JOB)
  async handleBulkEmail(job: Job<BulkEmailJobData>): Promise<NotificationResult[]> {
    const { payloads, batchId } = job.data;
    this.logger.log(`Processing bulk email job ${job.id} (batch: ${batchId}, count: ${payloads.length})`);

    const results: NotificationResult[] = [];

    for (const payload of payloads) {
      try {
        const rendered = this.templateService.renderTemplate(payload.template, payload.context);

        await this.emailCircuitBreaker.execute(
          () => this.sendEmail({
            to: payload.to,
            subject: rendered.subject,
            html: rendered.html,
            text: rendered.text,
          }),
        );

        results.push({ success: true, messageId: `msg-${batchId}-${results.length}` });
      } catch (error: any) {
        this.logger.error(`Failed to send email to ${payload.to} in batch ${batchId}: ${error.message}`);
        results.push({ success: false, error: error.message });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    this.logger.log(`Bulk email batch ${batchId} completed: ${successCount}/${payloads.length} sent`);

    return results;
  }

  /**
   * Kirim email via Resend (https://resend.com) REST API.
   * - Bila RESEND_API_KEY tidak diset → fallback log (mode dev/lokal), email
   *   tidak benar-benar terkirim sehingga tidak memblokir pengembangan.
   * - Pengirim default: "Populi Center <info@populicenter.org>" (override via
   *   MAIL_FROM). Domain populicenter.org HARUS diverifikasi di Resend (DNS).
   * - Lempar error pada respons non-2xx agar Bull retry + circuit breaker
   *   menghitung kegagalan.
   */
  private async sendEmail(options: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void> {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    const from =
      this.configService.get<string>('MAIL_FROM') ||
      'Populi Center <info@populicenter.org>';

    if (!apiKey) {
      this.logger.warn(
        `[EMAIL:dev] RESEND_API_KEY belum diset — email TIDAK dikirim. To: ${options.to} | Subject: ${options.subject}`,
      );
      return;
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      throw new Error(`Resend gagal (${res.status}): ${detail}`);
    }
  }
}
