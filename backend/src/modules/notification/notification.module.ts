import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationService } from './notification.service';
import { EmailProcessor } from './processors';
import { EmailTemplateService } from './templates';
import { NotificationSchedulerService } from './scheduled';
import { NotificationController } from './notification.controller';
import { AnnouncementController } from './announcement.controller';
import { DeviceTokenService } from './device-token.service';
import { PushService } from './push.service';
import { NotificationFeedService } from './notification-feed.service';
import { DeviceToken } from './entities/device-token.entity';
import { UserNotification } from './entities/user-notification.entity';
import { NOTIFICATION_QUEUE } from './constants';
import { Survey } from '@modules/survey/entities/survey.entity';
import { SurveyResponse } from '@modules/response/entities/survey-response.entity';
import { User } from '@modules/auth/entities/user.entity';
import { AuditModule } from '@modules/audit';

@Module({
  imports: [
    BullModule.registerQueue({
      name: NOTIFICATION_QUEUE,
    }),
    TypeOrmModule.forFeature([Survey, SurveyResponse, User, DeviceToken, UserNotification]),
    ScheduleModule.forRoot(),
    AuditModule,
  ],
  controllers: [NotificationController, AnnouncementController],
  providers: [
    NotificationService,
    EmailProcessor,
    EmailTemplateService,
    NotificationSchedulerService,
    DeviceTokenService,
    PushService,
    NotificationFeedService,
  ],
  exports: [
    NotificationService,
    NotificationSchedulerService,
    DeviceTokenService,
    NotificationFeedService,
  ],
})
export class NotificationModule {}
