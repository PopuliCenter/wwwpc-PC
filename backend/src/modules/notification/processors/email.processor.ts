import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
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

  constructor(private readonly templateService: EmailTemplateService) {
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
   * Placeholder for actual email sending.
   * In production, replace with nodemailer, SendGrid, AWS SES, etc.
   */
  private async sendEmail(options: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Log for development - in production this would be the actual SMTP call
    this.logger.debug(`[EMAIL] To: ${options.to} | Subject: ${options.subject}`);
  }
}
