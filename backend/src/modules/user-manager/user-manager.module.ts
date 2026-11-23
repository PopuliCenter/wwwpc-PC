import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserManagerService } from './user-manager.service';
import { UserManagerController } from './user-manager.controller';
import { User } from '@modules/auth/entities/user.entity';
import { AuditModule } from '@modules/audit/audit.module';
import { AuthModule } from '@modules/auth/auth.module';
import { ExportModule } from '@modules/export/export.module';

@Module({
  // ExportModule → StorageCleanupService (hapus berkas MinIO saat hapus akun).
  imports: [TypeOrmModule.forFeature([User]), AuditModule, AuthModule, ExportModule],
  controllers: [UserManagerController],
  providers: [UserManagerService],
  exports: [UserManagerService],
})
export class UserManagerModule {}
