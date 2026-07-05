import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { EnvThrottlerGuard } from './common/guards/env-throttler.guard';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { JwtAuthGuard } from './modules/auth/guards';
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
    // Batas laju global (anti-abuse). Dapat disetel via env untuk LOAD TEST
    // (banyak virtual-user dari satu IP) — mis. THROTTLE_LIMIT=100000. JANGAN
    // longgarkan di produksi normal; default 100/menit tetap berlaku bila kosong.
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.THROTTLE_TTL_MS ?? 60000),
        limit: Number(process.env.THROTTLE_LIMIT ?? 100),
      },
    ]),
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
      // EnvThrottlerGuard = ThrottlerGuard yang bisa dimatikan via DISABLE_THROTTLE
      // (load test dari 1 IP). Default: aktif seperti biasa.
      provide: APP_GUARD,
      useClass: EnvThrottlerGuard,
    },
    {
      // Global auth: SEMUA route wajib JWT kecuali yang ditandai @Public().
      // Jalan setelah ThrottlerGuard (rate-limit tetap berlaku utk route publik).
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
