import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventType, ResponseSubmittedPayload } from '../event-types';
import { NotificationService } from '@modules/notification/notification.service';
import { RewardService } from '@modules/reward/reward.service';
import { AuditService } from '@modules/audit/audit.service';
import { AuditActionType } from '@shared/enums';
import { PointCreditReason } from '@shared/enums';

@Injectable()
export class ResponseSubmittedHandler {
  private readonly logger = new Logger(ResponseSubmittedHandler.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly rewardService: RewardService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Credit points to respondent after successful submission.
   */
  @OnEvent(EventType.RESPONSE_SUBMITTED, { async: true })
  async handleRewardCredit(payload: ResponseSubmittedPayload): Promise<void> {
    try {
      await this.rewardService.creditSurveyCompletion(
        payload.respondentId,
        payload.surveyId,
        100, // base points for survey completion
        'complete',
      );
      this.logger.log(
        `Points credited for response: respondentId=${payload.respondentId}, surveyId=${payload.surveyId}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to credit points for response: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Send submission confirmation email to respondent.
   */
  @OnEvent(EventType.RESPONSE_SUBMITTED, { async: true })
  async handleNotification(payload: ResponseSubmittedPayload): Promise<void> {
    try {
      await this.notificationService.sendSubmissionConfirmation(
        { email: payload.respondentEmail, fullName: payload.respondentName },
        { title: payload.surveyTitle },
        payload.submittedAt,
      );
      this.logger.log(
        `Submission confirmation sent: respondentId=${payload.respondentId}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to send submission confirmation: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Log the submission event in audit trail.
   */
  @OnEvent(EventType.RESPONSE_SUBMITTED, { async: true })
  async handleAuditLog(payload: ResponseSubmittedPayload): Promise<void> {
    try {
      await this.auditService.log({
        userId: payload.respondentId,
        actionType: AuditActionType.NOTIFICATION_SENT,
        module: 'response',
        details: {
          event: EventType.RESPONSE_SUBMITTED,
          surveyId: payload.surveyId,
          responseId: payload.responseId,
        },
        ipAddress: 'system',
        timestamp: new Date(),
      });
    } catch (error: any) {
      this.logger.error(
        `Failed to log audit event for submission: ${error.message}`,
        error.stack,
      );
    }
  }
}
