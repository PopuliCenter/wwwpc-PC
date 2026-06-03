import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventType, RewardRedeemedPayload } from '../event-types';
import { NotificationService } from '@modules/notification/notification.service';
import { AuditService } from '@modules/audit/audit.service';
import { AuditActionType } from '@shared/enums';

@Injectable()
export class RewardRedeemedHandler {
  private readonly logger = new Logger(RewardRedeemedHandler.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Send redemption confirmation email after successful reward redemption.
   */
  @OnEvent(EventType.REWARD_REDEEMED, { async: true })
  async handleNotification(payload: RewardRedeemedPayload): Promise<void> {
    try {
      await this.notificationService.sendRedemptionConfirmation(
        { email: payload.email, fullName: payload.fullName },
        {
          rewardType: payload.rewardType,
          pointsSpent: payload.pointsSpent,
          destinationNumber: payload.destinationNumber,
          remainingBalance: payload.remainingBalance,
        },
      );

      this.logger.log(
        `Redemption confirmation sent: userId=${payload.userId}, redemptionId=${payload.redemptionId}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to send redemption confirmation: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Log the redemption event in audit trail.
   */
  @OnEvent(EventType.REWARD_REDEEMED, { async: true })
  async handleAuditLog(payload: RewardRedeemedPayload): Promise<void> {
    try {
      await this.auditService.log({
        userId: payload.userId,
        actionType: AuditActionType.REWARD_REDEMPTION,
        module: 'reward',
        details: {
          event: EventType.REWARD_REDEEMED,
          redemptionId: payload.redemptionId,
          rewardType: payload.rewardType,
          pointsSpent: payload.pointsSpent,
          destinationNumber: payload.destinationNumber,
        },
        ipAddress: 'system',
        timestamp: new Date(),
      });
    } catch (error: any) {
      this.logger.error(
        `Failed to log audit event for redemption: ${error.message}`,
        error.stack,
      );
    }
  }
}
