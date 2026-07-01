import { Controller, Post, Body, Req, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { JwtAuthGuard, RolesGuard } from '@modules/auth/guards';
import { Roles } from '@modules/auth/decorators';
import { UserRole, AuditActionType } from '@shared/enums';
import { AuditService } from '@modules/audit/audit.service';
import { NotificationFeedService } from './notification-feed.service';
import { SendAnnouncementDto } from './dto/send-announcement.dto';

/** Ambil IP klien (hormati proxy). */
function clientIp(req: any): string {
  return (
    (req?.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req?.ip || 'unknown'
  );
}

/**
 * Pengumuman/Berita ke responden (admin). Disiarkan ke feed lonceng semua
 * responden aktif + opsional push.
 */
@Controller('announcements')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class AnnouncementController {
  constructor(
    private readonly feedService: NotificationFeedService,
    private readonly auditService: AuditService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async send(
    @Req() req: any,
    @Body() dto: SendAnnouncementDto,
  ): Promise<{ recipients: number; pushed: number; emailed: number }> {
    const result = await this.feedService.broadcastAnnouncement({
      title: dto.title,
      body: dto.body,
      link: dto.link,
      sendPush: dto.sendPush,
      sendEmail: dto.sendEmail,
    });
    await this.auditService.log({
      userId: req.user.userId,
      actionType: AuditActionType.NOTIFICATION_SENT,
      module: 'notification',
      details: {
        kind: 'announcement',
        title: dto.title,
        recipients: result.recipients,
        emailed: result.emailed,
      },
      ipAddress: clientIp(req),
    });
    return result;
  }
}
