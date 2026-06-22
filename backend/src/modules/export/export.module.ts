import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ExportService } from './export.service';
import { ExportController } from './export.controller';
import { StorageController } from './storage.controller';
import { ExportProcessor } from './processors';
import { S3StorageService } from './s3-storage.service';
import { ExportJob } from './entities/export-job.entity';
import { SurveyResponse } from '@modules/response/entities/survey-response.entity';
import { UserProfile } from '@modules/registration/entities/user-profile.entity';
import { Question } from '@modules/survey/entities/question.entity';
import { AuthModule } from '@modules/auth';
import { AuditModule } from '@modules/audit';
import { EXPORT_QUEUE } from './constants';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({
      name: EXPORT_QUEUE,
    }),
    TypeOrmModule.forFeature([ExportJob, SurveyResponse, UserProfile, Question]),
    AuthModule,
    AuditModule,
  ],
  controllers: [ExportController, StorageController],
  providers: [ExportService, ExportProcessor, S3StorageService],
  exports: [ExportService, S3StorageService],
})
export class ExportModule {}
