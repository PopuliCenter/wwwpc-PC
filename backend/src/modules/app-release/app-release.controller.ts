import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AuthenticatedRequest } from '@modules/auth/interfaces';
import { JwtAuthGuard, RolesGuard } from '@modules/auth/guards';
import { Public, Roles } from '@modules/auth/decorators';
import { AuditService } from '@modules/audit/audit.service';
import { AuditActionType, UserRole } from '@shared/enums';
import { clientIp } from '../../common/security/client-ip';
import { APP_PLATFORMS, type AppPlatform } from './app-release.constants';
import { AppReleaseService, type AppVersionInfo } from './app-release.service';
import { CreateAppReleaseDto } from './dto/create-app-release.dto';

function normalizePlatform(raw: string | undefined): AppPlatform {
  const p = (raw ?? 'android').toLowerCase();
  return (APP_PLATFORMS as readonly string[]).includes(p) ? (p as AppPlatform) : 'android';
}

/**
 * Versi terbaru app native — PUBLIK (dicek juga sebelum login, mis. layar wajib
 * update). Tanpa throttle: dipanggil setiap app dibuka/kembali ke depan, isinya
 * tidak sensitif dan di-cache 30 dtk di service. Rate-limit per-IP di sini
 * justru berbahaya: sebelum TRUST_PROXY_HOPS diset, semua pengguna terlihat
 * satu IP sehingga kuotanya habis bersama dan app gagal mengecek versi.
 */
@Public()
@Controller('app')
export class AppVersionController {
  constructor(private readonly service: AppReleaseService) {}

  @Get('version')
  @SkipThrottle()
  @Header('Cache-Control', 'public, max-age=60')
  getVersion(@Query('platform') platform?: string): Promise<AppVersionInfo> {
    return this.service.getVersionInfo(normalizePlatform(platform));
  }
}

/** Panel admin: catat rilis app, umumkan, hapus yang salah input. */
@Controller('admin/app-releases')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class AppReleaseAdminController {
  constructor(
    private readonly service: AppReleaseService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  async list() {
    return {
      items: await this.service.list(),
      allowedHosts: this.service.getAllowedHosts(),
    };
  }

  @Post()
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateAppReleaseDto) {
    const result = await this.service.create(dto, req.user.userId);
    await this.auditService.log({
      userId: req.user.userId,
      actionType: AuditActionType.APP_RELEASE_PUBLISH,
      module: 'app-release',
      details: {
        releaseId: result.release.id,
        platform: result.release.platform,
        versionCode: result.release.versionCode,
        versionName: result.release.versionName,
        downloadUrl: result.release.downloadUrl,
        forceUpdate: result.release.forceUpdate,
        announced: result.announced,
      },
      ipAddress: clientIp(req),
    });
    return result;
  }

  @Post(':id/announce')
  @HttpCode(HttpStatus.OK)
  async announce(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    const result = await this.service.announce(id);
    await this.auditService.log({
      userId: req.user.userId,
      actionType: AuditActionType.NOTIFICATION_SENT,
      module: 'app-release',
      details: { kind: 'app_update', releaseId: id, ...result },
      ipAddress: clientIp(req),
    });
    return result;
  }

  @Delete(':id')
  async remove(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    const release = await this.service.remove(id);
    await this.auditService.log({
      userId: req.user.userId,
      actionType: AuditActionType.APP_RELEASE_DELETE,
      module: 'app-release',
      details: {
        releaseId: id,
        platform: release.platform,
        versionCode: release.versionCode,
        versionName: release.versionName,
      },
      ipAddress: clientIp(req),
    });
    return { deleted: true };
  }
}
