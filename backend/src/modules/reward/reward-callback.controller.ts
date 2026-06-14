import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { RewardService } from './reward.service';

/**
 * Endpoint callback PUBLIK untuk provider fulfillment async (mis. IAK).
 * Tidak memakai JwtAuthGuard — provider memanggil server-ke-server.
 *
 * KEAMANAN (TODO produksi): verifikasi keaslian callback IAK (mis. cek
 * signature/secret atau IP allowlist) sebelum dipercaya. Saat ini hanya
 * memfinalisasi redemption yang masih 'processing' dan id-nya berupa UUID
 * tak tertebak, sehingga dampak penyalahgunaan terbatas.
 */
@Controller('rewards/callback')
export class RewardCallbackController {
  constructor(private readonly rewardService: RewardService) {}

  @Post('iak')
  @HttpCode(200)
  async iak(@Body() payload: unknown) {
    return this.rewardService.handleProviderCallback(payload);
  }
}
