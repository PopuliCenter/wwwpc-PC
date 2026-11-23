import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientLog } from './client-log.entity';
import { ClientLogService } from './client-log.service';
import { ClientLogController, ClientLogAdminController } from './client-log.controller';
import { AuthModule } from '@modules/auth';

@Module({
  // AuthModule → JwtService: identitas pelapor dibaca dari JWT (bukan dari body).
  imports: [TypeOrmModule.forFeature([ClientLog]), AuthModule],
  controllers: [ClientLogController, ClientLogAdminController],
  providers: [ClientLogService],
})
export class ClientLogModule {}
