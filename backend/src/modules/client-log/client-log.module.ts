import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientLog } from './client-log.entity';
import { ClientLogService } from './client-log.service';
import {
  ClientLogController,
  ClientLogAdminController,
} from './client-log.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ClientLog])],
  controllers: [ClientLogController, ClientLogAdminController],
  providers: [ClientLogService],
})
export class ClientLogModule {}
