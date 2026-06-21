import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '@modules/auth/guards';
import { DeviceTokenService } from './device-token.service';
import { NotificationFeedService } from './notification-feed.service';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';
import { MarkReadDto } from './dto/mark-read.dto';

/**
 * Endpoint notifikasi untuk user yang login (semua peran, termasuk responden):
 * pendaftaran token perangkat + feed notifikasi dalam aplikasi (lonceng).
 */
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(
    private readonly deviceTokenService: DeviceTokenService,
    private readonly feedService: NotificationFeedService,
  ) {}

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

  /** Daftar notifikasi (lonceng) milik user. */
  @Get('feed')
  async getFeed(@Req() req: any, @Query('limit') limit?: string) {
    const n = limit ? parseInt(limit, 10) : 30;
    return this.feedService.getFeed(req.user.userId, Number.isFinite(n) ? n : 30);
  }

  /** Jumlah notifikasi belum dibaca (untuk badge lonceng). */
  @Get('feed/unread-count')
  async unreadCount(@Req() req: any): Promise<{ count: number }> {
    return { count: await this.feedService.unreadCount(req.user.userId) };
  }

  /** Tandai notifikasi sudah dibaca (ids kosong = semua). */
  @Post('feed/read')
  @HttpCode(HttpStatus.OK)
  async markRead(@Req() req: any, @Body() dto: MarkReadDto): Promise<{ ok: true }> {
    await this.feedService.markRead(req.user.userId, dto.ids);
    return { ok: true };
  }
}
