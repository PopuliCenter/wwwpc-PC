import { AuthenticatedRequest } from '@modules/auth/interfaces';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import type { JwtPayload } from '@modules/auth/interfaces';
import { JwtAuthGuard, RolesGuard } from '@modules/auth/guards';
import { Roles, Public } from '@modules/auth/decorators';
import { UserRole } from '@shared/enums';
import { ClientLogService } from './client-log.service';
import { CreateClientLogDto, PurgeClientLogDto } from './dto/create-client-log.dto';
import { clientIp } from '../../common/security/client-ip';

/**
 * Ingest log error dari klien (PUBLIK — error bisa terjadi sebelum login).
 * Di-throttle & dibatasi panjang payload via DTO.
 *
 * Identitas pelapor (user_id + email) HANYA diambil dari access token yang sah
 * bila klien mengirim `Authorization: Bearer` (T-34). `userEmail` di body
 * diabaikan: nilainya dikendalikan klien (bisa dipakai menanam PII/email orang
 * lain ke panel admin). Token tidak valid → laporan tetap disimpan, anonim.
 */
@Public()
@Controller('client-logs')
export class ClientLogController {
  constructor(
    private readonly service: ClientLogService,
    private readonly jwtService: JwtService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async ingest(@Body() dto: CreateClientLogDto, @Req() req: AuthenticatedRequest): Promise<void> {
    const reporter = await this.reporterFromToken(req);
    await this.service.record(dto, {
      userId: reporter?.userId ?? null,
      userEmail: reporter?.email ?? null,
      ipAddress: clientIp(req),
    });
  }

  private async reporterFromToken(
    req: AuthenticatedRequest,
  ): Promise<{ userId: string; email: string | null } | null> {
    const header = req.headers?.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(header.slice(7).trim());
      if (payload?.type === 'refresh' || typeof payload?.sub !== 'string') return null;
      return { userId: payload.sub, email: payload.email ?? null };
    } catch {
      return null; // kedaluwarsa / palsu → simpan sebagai anonim
    }
  }
}

/** Panel admin: telusur & kelola log error klien. */
@Controller('admin/client-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class ClientLogAdminController {
  constructor(private readonly service: ClientLogService) {}

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('platform') platform?: string,
    @Query('level') level?: string,
    @Query('search') search?: string,
  ) {
    return this.service.query({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      platform: platform || undefined,
      level: level || undefined,
      search: search || undefined,
    });
  }

  @Delete('purge')
  @Roles(UserRole.SUPER_ADMIN)
  async purge(@Body() dto: PurgeClientLogDto) {
    return this.service.purgeOlderThanDays(Number(dto.olderThanDays ?? 30));
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.service.deleteById(id);
  }
}
