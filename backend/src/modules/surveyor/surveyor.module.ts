import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SurveyorService } from './surveyor.service';
import { SurveyorAdminController } from './surveyor-admin.controller';
import { SurveyorController } from './surveyor.controller';
import { SurveyorQuota } from '@modules/survey/entities/surveyor-quota.entity';
import { Survey } from '@modules/survey/entities/survey.entity';
import { User } from '@modules/auth/entities';
import { SurveyResponse } from '@modules/response/entities/survey-response.entity';
import { SurveyModule } from '@modules/survey';
import { AuthModule } from '@modules/auth';
import { ResponseModule } from '@modules/response';

@Module({
  imports: [
    TypeOrmModule.forFeature([SurveyorQuota, Survey, User, SurveyResponse]),
    SurveyModule, // SurveyFillService + AnswerValidationService
    ResponseModule, // FileUploadService (upload media surveyor)
    AuthModule,
  ],
  controllers: [SurveyorAdminController, SurveyorController],
  providers: [SurveyorService],
  exports: [SurveyorService],
})
export class SurveyorModule {}
