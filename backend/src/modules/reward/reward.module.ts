import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { RewardService } from './reward.service';
import { RewardController } from './reward.controller';
import { PointTransaction } from './entities/point-transaction.entity';
import { RewardRedemption } from './entities/reward-redemption.entity';
import { StreakTracker } from './entities/streak-tracker.entity';
import { AuthModule } from '@modules/auth';

@Module({
  imports: [
    TypeOrmModule.forFeature([PointTransaction, RewardRedemption, StreakTracker]),
    ScheduleModule.forRoot(),
    AuthModule,
  ],
  controllers: [RewardController],
  providers: [RewardService],
  exports: [RewardService],
})
export class RewardModule {}
