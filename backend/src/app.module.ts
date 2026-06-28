import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './config';
import { HealthModule } from './common/health';
import { AuthModule } from './modules/auth';
import { RegistrationModule } from './modules/registration';
import { SurveyModule } from './modules/survey';
import { ResponseModule } from './modules/response';
import { SurveyorModule } from './modules/surveyor';
import { RewardModule } from './modules/reward';
import { NotificationModule } from './modules/notification';
import { GeolocationModule } from './modules/geolocation';
import { ExportModule } from './modules/export';
import { DashboardModule } from './modules/dashboard';
import { AuditModule } from './modules/audit';
import { UserManagerModule } from './modules/user-manager';
import { DataCleanupModule } from './modules/data-cleanup';
import { EventsModule } from './modules/events';
import { AssistantModule } from './modules/assistant/assistant.module';
import { ClientLogModule } from './modules/client-log/client-log.module';

@Module({
  imports: [
    DatabaseModule,
    HealthModule,
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),
    AuthModule,
    RegistrationModule,
    SurveyModule,
    ResponseModule,
    SurveyorModule,
    RewardModule,
    NotificationModule,
    GeolocationModule,
    ExportModule,
    DashboardModule,
    AuditModule,
    UserManagerModule,
    DataCleanupModule,
    EventsModule,
    AssistantModule,
    ClientLogModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
