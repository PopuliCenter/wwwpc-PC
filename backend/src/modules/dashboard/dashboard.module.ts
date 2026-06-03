import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { User } from '@modules/auth/entities/user.entity';
import { Survey } from '@modules/survey/entities/survey.entity';
import { SurveyResponse } from '@modules/response/entities/survey-response.entity';
import { Geolocation } from '@modules/geolocation/entities/geolocation.entity';
import { UserProfile } from '@modules/registration/entities/user-profile.entity';
import { AuthModule } from '@modules/auth';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Survey, SurveyResponse, Geolocation, UserProfile]),
    AuthModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
