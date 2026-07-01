import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RegistrationService } from './registration.service';
import { RegistrationController } from './registration.controller';
import { UserProfile } from './entities';
import { User } from '@modules/auth/entities';
import { AuthModule } from '@modules/auth';
import { NotificationModule } from '@modules/notification';

@Module({
  imports: [TypeOrmModule.forFeature([User, UserProfile]), AuthModule, NotificationModule],
  controllers: [RegistrationController],
  providers: [RegistrationService],
  exports: [RegistrationService],
})
export class RegistrationModule {}
