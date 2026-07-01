import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { RewardService } from './reward.service';
import { RewardController } from './reward.controller';
import { RewardCallbackController } from './reward-callback.controller';
import { PointTransaction } from './entities/point-transaction.entity';
import { RewardRedemption } from './entities/reward-redemption.entity';
import { StreakTracker } from './entities/streak-tracker.entity';
import { User } from '@modules/auth/entities';
import { AuthModule } from '@modules/auth';
import { NotificationModule } from '@modules/notification';
import {
  REWARD_FULFILLMENT_PROVIDER,
  ManualFulfillmentProvider,
  IakFulfillmentProvider,
  RewardFulfillmentProvider,
} from './fulfillment';

@Module({
  imports: [
    TypeOrmModule.forFeature([PointTransaction, RewardRedemption, StreakTracker, User]),
    ScheduleModule.forRoot(),
    AuthModule,
    NotificationModule,
  ],
  controllers: [RewardController, RewardCallbackController],
  providers: [
    RewardService,
    {
      // Pilih provider fulfillment via env REWARD_PROVIDER ('manual' default | 'iak').
      provide: REWARD_FULFILLMENT_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): RewardFulfillmentProvider => {
        const provider = (config.get<string>('REWARD_PROVIDER') || 'manual').toLowerCase();
        if (provider === 'iak') return new IakFulfillmentProvider(config);
        return new ManualFulfillmentProvider();
      },
    },
  ],
  exports: [RewardService],
})
export class RewardModule {}
