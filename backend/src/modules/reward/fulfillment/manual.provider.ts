import { Logger } from '@nestjs/common';
import {
  FulfillmentOutcome,
  FulfillmentRequest,
  RewardFulfillmentProvider,
} from './reward-fulfillment.types';

/**
 * Provider default: tidak mengirim apa pun ke pihak ketiga. Redemption tetap
 * PROCESSING agar admin memprosesnya manual lalu menandainya selesai.
 * Selalu aman dijalankan tanpa kredensial.
 */
export class ManualFulfillmentProvider implements RewardFulfillmentProvider {
  readonly name = 'manual';
  private readonly logger = new Logger('ManualFulfillmentProvider');

  async fulfill(req: FulfillmentRequest): Promise<FulfillmentOutcome> {
    this.logger.log(
      `Redemption ${req.redemptionId} (${req.rewardId} → ${req.destinationNumber}) menunggu pemrosesan manual oleh admin.`,
    );
    return {
      status: 'pending',
      message: 'Penukaran sedang diproses oleh admin.',
    };
  }
}
