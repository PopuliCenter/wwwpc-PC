import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { DataCleanupService } from './data-cleanup.service';
import { DataCleanupController } from './data-cleanup.controller';
import { ScheduledPurgeConfig } from './entities/scheduled-purge-config.entity';
import { PendingDeletion } from './entities/pending-deletion.entity';
import { SurveyResponse } from '@modules/response/entities/survey-response.entity';
import { Survey } from '@modules/survey/entities/survey.entity';
import { User } from '@modules/auth/entities/user.entity';
import { UserProfile } from '@modules/registration/entities/user-profile.entity';
import { Geolocation } from '@modules/geolocation/entities/geolocation.entity';
import { AuditModule } from '@modules/audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ScheduledPurgeConfig,
      PendingDeletion,
      SurveyResponse,
      Survey,
      User,
      UserProfile,
      Geolocation,
    ]),
    ScheduleModule.forRoot(),
    AuditModule,
  ],
  controllers: [DataCleanupController],
  providers: [DataCleanupService],
  exports: [DataCleanupService],
})
export class DataCleanupModule {}
