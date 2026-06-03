import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserManagerService } from './user-manager.service';
import { UserManagerController } from './user-manager.controller';
import { User } from '@modules/auth/entities/user.entity';
import { AuditModule } from '@modules/audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([User]), AuditModule],
  controllers: [UserManagerController],
  providers: [UserManagerService],
  exports: [UserManagerService],
})
export class UserManagerModule {}
