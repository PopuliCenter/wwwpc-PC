import { AuthenticatedRequest } from '@modules/auth/interfaces';
import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard, RolesGuard } from '@modules/auth/guards';
import { Roles } from '@modules/auth/decorators';
import { UserRole, AuditActionType } from '@shared/enums';
import { AuditService } from '@modules/audit/audit.service';
import { DeviceTokenService, TestPushResult } from './device-token.service';
import { NotificationFeedService } from './notification-feed.service';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';
import { MarkReadDto } from './dto/mark-read.dto';
import { SendTestPushDto } from './dto/send-test-push.dto';

/** Ambil IP klien (hormati proxy). */
function clientIp(req: any): string {
  return (
    (req?.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req?.ip || 'unknown'
  );
}

/**
 * Endpoint notifikasi untuk user yang login (semua peran, termasuk responden):
 * pendaftaran token perangkat + feed notifikasi dalam aplikasi (lonceng).
 * Pengecualian: POST /notifications/test-push khusus admin (RolesGuard per-route).
 */
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(
    private readonly deviceTokenService: DeviceTokenService,
    private readonly feedService: NotificationFeedService,
    private readonly auditService: AuditService,
  ) {}

  /** Daftarkan token FCM/APNs perangkat milik user yang sedang login. */
  @Post('device-token')
  @HttpCode(HttpStatus.OK)
  async registerDeviceToken(
    @Req() req: AuthenticatedRequest,
    @Body() dto: RegisterDeviceTokenDto,
  ): Promise<{ ok: true }> {
    await this.deviceTokenService.register(req.user.userId, dto.token, dto.platform);
    return { ok: true };
  }

  /**
   * Kirim SATU push uji ke semua perangkat milik user tertentu (khusus admin),
   * untuk memeriksa notifikasi di HP responden. Tidak menulis ke feed lonceng.
   * 404 bila user tidak ada.
   */
  @Post('test-push')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async sendTestPush(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SendTestPushDto,
  ): Promise<TestPushResult> {
    const result = await this.deviceTokenService.sendTestPush(dto.userId);
    await this.auditService.log({
      userId: req.user.userId,
      actionType: AuditActionType.NOTIFICATION_SENT,
      module: 'notification',
      details: {
        kind: 'test_push',
        targetUserId: dto.userId,
        pushEnabled: result.pushEnabled,
        devices: result.devices,
        pushed: result.pushed,
      },
      ipAddress: clientIp(req),
    });
    return result;
  }

  /** Daftar notifikasi (lonceng) milik user. */
  @Get('feed')
  async getFeed(@Req() req: AuthenticatedRequest, @Query('limit') limit?: string) {
    const n = limit ? parseInt(limit, 10) : 30;
    return this.feedService.getFeed(req.user.userId, Number.isFinite(n) ? n : 30);
  }

  /** Jumlah notifikasi belum dibaca (untuk badge lonceng). */
  @Get('feed/unread-count')
  async unreadCount(@Req() req: AuthenticatedRequest): Promise<{ count: number }> {
    return { count: await this.feedService.unreadCount(req.user.userId) };
  }

  /** Tandai notifikasi sudah dibaca (ids kosong = semua). */
  @Post('feed/read')
  @HttpCode(HttpStatus.OK)
  async markRead(
    @Req() req: AuthenticatedRequest,
    @Body() dto: MarkReadDto,
  ): Promise<{ ok: true }> {
    await this.feedService.markRead(req.user.userId, dto.ids);
    return { ok: true };
  }

  /** Hapus SEMUA notifikasi milik user. (Sebelum '/feed/:id' agar tidak bentrok.) */
  @Delete('feed')
  @HttpCode(HttpStatus.OK)
  async clearAll(@Req() req: AuthenticatedRequest): Promise<{ ok: true }> {
    await this.feedService.clearAll(req.user.userId);
    return { ok: true };
  }

  /** Hapus satu notifikasi milik user. */
  @Delete('feed/:id')
  @HttpCode(HttpStatus.OK)
  async deleteOne(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    await this.feedService.deleteOne(req.user.userId, id);
    return { ok: true };
  }
}
