import {
  Controller,
  Post,
  Body,
  HttpCode,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RewardService } from './reward.service';

/**
 * Endpoint callback PUBLIK untuk provider fulfillment async (mis. IAK).
 * Tidak memakai JwtAuthGuard — provider memanggil server-ke-server.
 *
 * KEAMANAN (berlapis):
 *  1) Keaslian payload diverifikasi via SIGNATURE md5 di IakFulfillmentProvider
 *     .parseCallback (IAK_VERIFY_CALLBACK_SIGN, default aktif).
 *  2) Hanya memfinalisasi redemption ber-status 'processing' dgn ref UUID
 *     tak tertebak → dampak terbatas.
 *  3) Opsional: IP allowlist (env IAK_CALLBACK_IPS, dipisah koma) sbg pertahanan
 *     tambahan. Bila kosong, lapisan 1 & 2 yang berlaku.
 */
@Controller('rewards/callback')
export class RewardCallbackController {
  private readonly allowedIps: string[];

  constructor(
    private readonly rewardService: RewardService,
    config: ConfigService,
  ) {
    this.allowedIps = (config.get<string>('IAK_CALLBACK_IPS') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  @Post('iak')
  @HttpCode(200)
  async iak(@Body() payload: unknown, @Req() req: any) {
    if (this.allowedIps.length > 0) {
      const ip =
        (req?.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req?.ip ||
        '';
      if (!this.allowedIps.includes(ip)) {
        throw new ForbiddenException('IP tidak diizinkan.');
      }
    }
    return this.rewardService.handleProviderCallback(payload);
  }
}
