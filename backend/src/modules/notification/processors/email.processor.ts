import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bull';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
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
  private smtpTransport?: Transporter;

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

  /** Pengirim default; override via MAIL_FROM. */
  private get from(): string {
    return (
      this.configService.get<string>('MAIL_FROM') ||
      'Populi Center <info@populicenter.org>'
    );
  }

  /**
   * Tentukan provider: env EMAIL_PROVIDER ('smtp'|'resend') bila diset; jika
   * tidak, auto-deteksi — utamakan Resend bila ada RESEND_API_KEY, lalu SMTP
   * bila ada SMTP_HOST, jika keduanya kosong → 'none' (mode dev, hanya log).
   */
  private resolveProvider(): 'smtp' | 'resend' | 'none' {
    const explicit = this.configService.get<string>('EMAIL_PROVIDER');
    if (explicit === 'smtp' || explicit === 'resend') return explicit;
    if (this.configService.get<string>('RESEND_API_KEY')) return 'resend';
    if (this.configService.get<string>('SMTP_HOST')) return 'smtp';
    return 'none';
  }

  /**
   * Kirim email lewat provider terpilih (SMTP via nodemailer ATAU Resend REST).
   * Lempar error pada kegagalan agar Bull retry + circuit breaker menghitung.
   */
  private async sendEmail(options: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void> {
    const provider = this.resolveProvider();

    if (provider === 'none') {
      this.logger.warn(
        `[EMAIL:dev] Provider email belum dikonfigurasi (set EMAIL_PROVIDER + RESEND_API_KEY atau SMTP_*). Email TIDAK dikirim. To: ${options.to} | Subject: ${options.subject}`,
      );
      return;
    }

    if (provider === 'smtp') {
      await this.sendViaSmtp(options);
    } else {
      await this.sendViaResend(options);
    }
  }

  private getSmtpTransport(): Transporter {
    if (this.smtpTransport) return this.smtpTransport;
    const host = this.configService.getOrThrow<string>('SMTP_HOST');
    const port = Number(this.configService.get<string>('SMTP_PORT') ?? '465');
    // Default SSL untuk port 465; STARTTLS (secure=false) untuk 587.
    const secureEnv = this.configService.get<string>('SMTP_SECURE');
    const secure = secureEnv != null ? secureEnv === 'true' : port === 465;
    this.smtpTransport = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user: this.configService.getOrThrow<string>('SMTP_USER'),
        pass: this.configService.getOrThrow<string>('SMTP_PASS'),
      },
    });
    return this.smtpTransport;
  }

  private async sendViaSmtp(options: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void> {
    await this.getSmtpTransport().sendMail({
      from: this.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
  }

  private async sendViaResend(options: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void> {
    const apiKey = this.configService.getOrThrow<string>('RESEND_API_KEY');
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
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
