import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '@modules/audit';
import { NotificationModule } from '@modules/notification';
import { AppRelease } from './app-release.entity';
import { AppReleaseService } from './app-release.service';
import { AppReleaseAdminController, AppVersionController } from './app-release.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AppRelease]), NotificationModule, AuditModule],
  controllers: [AppVersionController, AppReleaseAdminController],
  providers: [AppReleaseService],
})
export class AppReleaseModule {}
