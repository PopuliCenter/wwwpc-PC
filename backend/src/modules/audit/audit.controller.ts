import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@modules/auth/guards';
import { RolesGuard } from '@modules/auth/guards/roles.guard';
import { Roles } from '@modules/auth/decorators';
import { UserRole } from '@shared/enums';
import { AuditService } from './audit.service';
import { QueryAuditDto } from './dto';
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
  async queryAuditLogs(
    @Query() dto: QueryAuditDto,
  ): Promise<PaginatedAuditEntries> {
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
}
