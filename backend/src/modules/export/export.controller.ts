import { AuthenticatedRequest } from '@modules/auth/interfaces';
import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Body,
  Req,
  Res,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ExportService } from './export.service';
import { JwtAuthGuard, RolesGuard } from '@modules/auth/guards';
import { Roles } from '@modules/auth/decorators';
import { UserRole, AuditActionType } from '@shared/enums';
import { AuditService } from '@modules/audit/audit.service';

/** Ambil IP klien dari request (hormati proxy bila ada). */
function clientIp(req: any): string {
  return (
    (req?.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req?.ip || 'unknown'
  );
}

@Controller('export')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExportController {
  constructor(
    private readonly exportService: ExportService,
    private readonly auditService: AuditService,
  ) {}

  /** Export audit log (CSV). Dipanggil dari halaman Audit Log. */
  @Post('audit-log')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async exportAuditLog(@Body() filters: Record<string, any>, @Req() req: AuthenticatedRequest) {
    await this.auditService.log({
      userId: req.user.userId,
      actionType: AuditActionType.DATA_EXPORT,
      module: 'export',
      details: { kind: 'audit-log', filters: filters ?? {} },
      ipAddress: clientIp(req),
    });
    return this.exportService.exportAuditLog((filters ?? {}) as any, req.user.userId);
  }

  /** Trigger export respons survei dalam format csv|excel|pdf|json. */
  @Post(':format')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ANALYST)
  async exportResponses(
    @Param('format') format: string,
    @Query() query: Record<string, any>,
    @Req() req: AuthenticatedRequest,
  ) {
    const { surveyId, ...filters } = query;
    if (!surveyId) {
      throw new BadRequestException('Pilih survei terlebih dahulu untuk mengekspor data.');
    }
    const by = req.user.userId;
    await this.auditService.log({
      userId: by,
      actionType: AuditActionType.DATA_EXPORT,
      module: 'export',
      details: { kind: 'responses', format, surveyId },
      ipAddress: clientIp(req),
    });
    switch (format) {
      case 'csv':
        return this.exportService.exportCsv(surveyId, filters as any, by);
      case 'excel':
        return this.exportService.exportExcel(surveyId, filters as any, by);
      case 'pdf':
        return this.exportService.exportPdf(surveyId, filters as any, by);
      case 'json':
        return this.exportService.exportJson(surveyId, filters as any, by);
      default:
        throw new BadRequestException(`Format export tidak dikenal: ${format}`);
    }
  }

  /** Status sebuah job export (untuk polling dari frontend). */
  @Get(':jobId/status')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ANALYST)
  async status(@Param('jobId') jobId: string, @Req() req: AuthenticatedRequest) {
    const job = await this.exportService.getExportStatus(jobId, {
      id: req.user.userId,
      role: req.user.role,
    });
    return { id: job.id, status: job.status, format: job.format };
  }

  /** Unduh file export selesai (di-stream lewat backend). */
  @Get(':jobId/download')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ANALYST)
  async download(
    @Param('jobId') jobId: string,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const { buffer, contentType, filename } = await this.exportService.getExportFile(jobId, {
      id: req.user.userId,
      role: req.user.role,
    });
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
