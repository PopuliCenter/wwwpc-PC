import { Controller, Get, Post, Body, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@modules/auth/guards';
import { RolesGuard } from '@modules/auth/guards/roles.guard';
import { Roles } from '@modules/auth/decorators';
import { UserRole, AuditActionType } from '@shared/enums';
import { AuditService } from './audit.service';
import { QueryAuditDto, PurgeAuditDto, DeleteAuditDto } from './dto';
import { AuditFilter, PaginatedAuditEntries } from './interfaces';

@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /**
   * Query audit logs with filters and pagination.
   * Only accessible by Super_Admin and Admin roles.
   */
  @Get()
  async queryAuditLogs(@Query() dto: QueryAuditDto): Promise<PaginatedAuditEntries> {
    const filters: AuditFilter = {};

    if (dto.userId) filters.userId = dto.userId;
    if (dto.actionType) filters.actionType = dto.actionType;
    if (dto.module) filters.module = dto.module;
    if (dto.ipAddress) filters.ipAddress = dto.ipAddress;
    if (dto.startDate || dto.endDate) {
      filters.dateRange = {
        start: dto.startDate || '',
        end: dto.endDate || '',
      };
    }

    return this.auditService.query(filters, {
      page: dto.page,
      limit: dto.limit,
    });
  }

  /**
   * Hapus log terpilih. HANYA super_admin (override class-level) — menghapus
   * jejak audit bersifat sensitif.
   */
  @Post('delete')
  @Roles(UserRole.SUPER_ADMIN)
  async deleteSelected(@Body() dto: DeleteAuditDto, @Req() req: any): Promise<{ deleted: number }> {
    const deleted = await this.auditService.deleteByIds(dto.ids);
    await this.auditService.log({
      userId: req.user.userId,
      actionType: AuditActionType.DATA_CLEANUP,
      module: 'audit',
      details: { count: deleted, ids: dto.ids.slice(0, 50) },
      ipAddress: req.ip || '0.0.0.0',
    });
    return { deleted };
  }

  /** Purge manual log lebih lama dari N hari. HANYA super_admin. */
  @Post('purge')
  @Roles(UserRole.SUPER_ADMIN)
  async purge(@Body() dto: PurgeAuditDto, @Req() req: any): Promise<{ deleted: number }> {
    const deleted = await this.auditService.purgeOlderThanDays(dto.olderThanDays);
    await this.auditService.log({
      userId: req.user.userId,
      actionType: AuditActionType.DATA_CLEANUP,
      module: 'audit',
      details: { purgeOlderThanDays: dto.olderThanDays, count: deleted },
      ipAddress: req.ip || '0.0.0.0',
    });
    return { deleted };
  }
}
