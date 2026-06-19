import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationService } from './notification.service';
import { EmailProcessor } from './processors';
import { EmailTemplateService } from './templates';
import { NotificationSchedulerService } from './scheduled';
import { NotificationController } from './notification.controller';
import { DeviceTokenService } from './device-token.service';
import { PushService } from './push.service';
import { DeviceToken } from './entities/device-token.entity';
import { NOTIFICATION_QUEUE } from './constants';
import { Survey } from '@modules/survey/entities/survey.entity';
import { SurveyResponse } from '@modules/response/entities/survey-response.entity';
import { User } from '@modules/auth/entities/user.entity';

@Module({
  imports: [
    BullModule.registerQueue({
      name: NOTIFICATION_QUEUE,
    }),
    TypeOrmModule.forFeature([Survey, SurveyResponse, User, DeviceToken]),
    ScheduleModule.forRoot(),
  ],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    EmailProcessor,
    EmailTemplateService,
    NotificationSchedulerService,
    DeviceTokenService,
    PushService,
  ],
  exports: [NotificationService, NotificationSchedulerService, DeviceTokenService],
})
export class NotificationModule {}
