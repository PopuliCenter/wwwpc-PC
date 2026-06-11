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
import { UserRole } from '@shared/enums';

@Controller('export')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  /** Export audit log (CSV). Dipanggil dari halaman Audit Log. */
  @Post('audit-log')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async exportAuditLog(@Body() filters: Record<string, any>, @Req() req: any) {
    return this.exportService.exportAuditLog((filters ?? {}) as any, req.user.userId);
  }

  /** Trigger export respons survei dalam format csv|excel|pdf|json. */
  @Post(':format')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ANALYST)
  async exportResponses(
    @Param('format') format: string,
    @Query() query: Record<string, any>,
    @Req() req: any,
  ) {
    const { surveyId, ...filters } = query;
    if (!surveyId) {
      throw new BadRequestException('Pilih survei terlebih dahulu untuk mengekspor data.');
    }
    const by = req.user.userId;
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
  async status(@Param('jobId') jobId: string) {
    const job = await this.exportService.getExportStatus(jobId);
    return { id: job.id, status: job.status, format: job.format };
  }

  /** Unduh file export selesai (di-stream lewat backend). */
  @Get(':jobId/download')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ANALYST)
  async download(@Param('jobId') jobId: string, @Res() res: Response) {
    const { buffer, contentType, filename } = await this.exportService.getExportFile(jobId);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
