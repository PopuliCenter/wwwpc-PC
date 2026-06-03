import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [
    // DataSource is provided globally by TypeOrmModule.forRootAsync in DatabaseModule.
    // We only need to ensure TypeOrmModule is imported to get InjectDataSource working.
    TypeOrmModule.forFeature([]),
  ],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
