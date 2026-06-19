import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '@modules/auth/guards';
import { DeviceTokenService } from './device-token.service';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';

/**
 * Endpoint notifikasi untuk perangkat (dipanggil aplikasi Capacitor). Cukup
 * login (semua peran, termasuk responden) — tidak butuh peran admin.
 */
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly deviceTokenService: DeviceTokenService) {}

  /** Daftarkan token FCM/APNs perangkat milik user yang sedang login. */
  @Post('device-token')
  @HttpCode(HttpStatus.OK)
  async registerDeviceToken(
    @Req() req: any,
    @Body() dto: RegisterDeviceTokenDto,
  ): Promise<{ ok: true }> {
    await this.deviceTokenService.register(req.user.userId, dto.token, dto.platform);
    return { ok: true };
  }
}
