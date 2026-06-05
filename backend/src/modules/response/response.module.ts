import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResponseService } from './response.service';
import { ResponseController } from './response.controller';
import { FileValidationService } from './services/file-validation.service';
import { FileUploadService } from './services/file-upload.service';
import { SurveyResponse } from './entities/survey-response.entity';
import { Answer } from './entities/answer.entity';
import { ManualRewardDistribution } from './entities/manual-reward-distribution.entity';
import { SurveyModule } from '@modules/survey';
import { AuthModule } from '@modules/auth';
import { ExportModule } from '@modules/export';

@Module({
  imports: [
    TypeOrmModule.forFeature([SurveyResponse, Answer, ManualRewardDistribution]),
    SurveyModule,
    AuthModule,
    ExportModule, // provides S3StorageService for respondent file uploads
  ],
  controllers: [ResponseController],
  providers: [ResponseService, FileValidationService, FileUploadService],
  exports: [ResponseService],
})
export class ResponseModule {}
