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
import { JwtAuthGuard, RolesGuard } from '@modules/auth/guards';
import { Roles } from '@modules/auth/decorators';
import { UserRole } from '@shared/enums';
import { ClientLogService } from './client-log.service';
import { CreateClientLogDto, PurgeClientLogDto } from './dto/create-client-log.dto';

function clientIp(req: any): string {
  return (
    (req?.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req?.ip ||
    'unknown'
  );
}

/**
 * Ingest log error dari klien (PUBLIK — error bisa terjadi sebelum login).
 * Di-throttle & dibatasi panjang payload via DTO. userEmail bersifat
 * laporan-klien (untuk monitoring, bukan keputusan keamanan).
 */
@Controller('client-logs')
export class ClientLogController {
  constructor(private readonly service: ClientLogService) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async ingest(@Body() dto: CreateClientLogDto, @Req() req: any): Promise<void> {
    await this.service.record(dto, { userId: null, ipAddress: clientIp(req) });
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
