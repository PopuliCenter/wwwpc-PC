import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventType, PointsThresholdReachedPayload } from '../event-types';
import { NotificationService } from '@modules/notification/notification.service';

@Injectable()
export class PointsThresholdHandler {
  private readonly logger = new Logger(PointsThresholdHandler.name);

  constructor(private readonly notificationService: NotificationService) {}

  /**
   * Send notification email when user's balance reaches the redemption threshold.
   */
  @OnEvent(EventType.POINTS_THRESHOLD_REACHED, { async: true })
  async handleThresholdNotification(payload: PointsThresholdReachedPayload): Promise<void> {
    try {
      await this.notificationService.sendPointsThresholdNotification(
        { email: payload.email, fullName: payload.fullName },
        payload.currentBalance,
        payload.baseUrl,
      );

      this.logger.log(
        `Points threshold notification sent: userId=${payload.userId}, balance=${payload.currentBalance}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to send points threshold notification: ${error.message}`,
        error.stack,
      );
    }
  }
}
