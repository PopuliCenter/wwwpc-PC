import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import {
  ResponseSubmittedHandler,
  SurveyActivatedHandler,
  PointsThresholdHandler,
  RewardRedeemedHandler,
} from './handlers';
import { NotificationModule } from '@modules/notification';
import { RewardModule } from '@modules/reward';
import { AuditModule } from '@modules/audit';

@Module({
  imports: [
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      maxListeners: 20,
      verboseMemoryLeak: true,
    }),
    NotificationModule,
    RewardModule,
    AuditModule,
  ],
  providers: [
    ResponseSubmittedHandler,
    SurveyActivatedHandler,
    PointsThresholdHandler,
    RewardRedeemedHandler,
  ],
  exports: [],
})
export class EventsModule {}
