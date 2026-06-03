import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResponseService } from './response.service';
import { ResponseController } from './response.controller';
import { SurveyResponse } from './entities/survey-response.entity';
import { Answer } from './entities/answer.entity';
import { ManualRewardDistribution } from './entities/manual-reward-distribution.entity';
import { SurveyModule } from '@modules/survey';
import { AuthModule } from '@modules/auth';

@Module({
  imports: [
    TypeOrmModule.forFeature([SurveyResponse, Answer, ManualRewardDistribution]),
    SurveyModule,
    AuthModule,
  ],
  controllers: [ResponseController],
  providers: [ResponseService],
  exports: [ResponseService],
})
export class ResponseModule {}
