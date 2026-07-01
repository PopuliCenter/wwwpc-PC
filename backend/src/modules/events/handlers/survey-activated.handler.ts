import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventType, SurveyActivatedPayload } from '../event-types';
import { NotificationService } from '@modules/notification/notification.service';

@Injectable()
export class SurveyActivatedHandler {
  private readonly logger = new Logger(SurveyActivatedHandler.name);

  constructor(private readonly notificationService: NotificationService) {}

  /**
   * Send invitation emails to all eligible respondents when a survey is activated.
   */
  @OnEvent(EventType.SURVEY_ACTIVATED, { async: true })
  async handleSendInvitations(payload: SurveyActivatedPayload): Promise<void> {
    try {
      if (payload.respondents.length === 0) {
        this.logger.log(`No respondents to invite for survey: ${payload.surveyId}`);
        return;
      }

      await this.notificationService.sendSurveyInvitation(
        payload.respondents,
        {
          title: payload.surveyTitle,
          description: payload.surveyDescription,
          endDatetime: payload.endDatetime,
          id: payload.surveyId,
        },
        payload.baseUrl,
      );

      this.logger.log(
        `Invitation emails queued for survey: ${payload.surveyId}, recipients: ${payload.respondents.length}`,
      );
    } catch (error: any) {
      this.logger.error(`Failed to send survey invitations: ${error.message}`, error.stack);
    }
  }
}
