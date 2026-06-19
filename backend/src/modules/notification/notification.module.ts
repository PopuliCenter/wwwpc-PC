import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationService } from './notification.service';
import { EmailProcessor } from './processors';
import { EmailTemplateService } from './templates';
import { NotificationSchedulerService } from './scheduled';
import { NOTIFICATION_QUEUE } from './constants';
import { Survey } from '@modules/survey/entities/survey.entity';
import { SurveyResponse } from '@modules/response/entities/survey-response.entity';
import { User } from '@modules/auth/entities/user.entity';

@Module({
  imports: [
    BullModule.registerQueue({
      name: NOTIFICATION_QUEUE,
    }),
    TypeOrmModule.forFeature([Survey, SurveyResponse, User]),
    ScheduleModule.forRoot(),
  ],
  providers: [NotificationService, EmailProcessor, EmailTemplateService, NotificationSchedulerService],
  exports: [NotificationService, NotificationSchedulerService],
})
export class NotificationModule {}
