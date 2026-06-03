import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { DataCleanupService } from './data-cleanup.service';
import {
  RequestDeletionDto,
  ConfirmDeletionDto,
  CleanupFilterDto,
  GdprDeleteDto,
  PurgeConfigDto,
} from './dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/auth/guards/roles.guard';
import { Roles } from '@modules/auth/decorators';
import { UserRole } from '@shared/enums';

@Controller('data-cleanup')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class DataCleanupController {
  constructor(private readonly dataCleanupService: DataCleanupService) {}

  @Post('request')
  async requestDeletion(@Body() dto: RequestDeletionDto, @Req() req: any) {
    const adminUserId = req.user.userId;
    const ipAddress = req.ip || req.connection?.remoteAddress || '0.0.0.0';

    const request = {
      surveyId: dto.surveyId,
      dateRange: dto.dateRange
        ? { start: new Date(dto.dateRange.start), end: new Date(dto.dateRange.end) }
        : undefined,
      exportStatus: dto.exportStatus as 'exported_only',
      requireDoubleConfirmation: true as const,
    };

    return this.dataCleanupService.requestDeletion(request, adminUserId, ipAddress);
  }

  @Post('confirm/:requestId')
  @HttpCode(HttpStatus.OK)
  async confirmDeletion(
    @Param('requestId') requestId: string,
    @Body() dto: ConfirmDeletionDto,
    @Req() req: any,
  ) {
    const adminUserId = req.user.userId;
    const ipAddress = req.ip || req.connection?.remoteAddress || '0.0.0.0';
    return this.dataCleanupService.confirmDeletion(
      requestId,
      dto.confirmationToken,
      adminUserId,
      ipAddress,
    );
  }

  @Post('archive/:surveyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archiveSurvey(@Param('surveyId') surveyId: string, @Req() req: any) {
    const adminUserId = req.user.userId;
    const ipAddress = req.ip || req.connection?.remoteAddress || '0.0.0.0';
    await this.dataCleanupService.archiveSurvey(surveyId, adminUserId, ipAddress);
  }

  @Get('candidates')
  async getCleanupCandidates(@Query() filters: CleanupFilterDto) {
    const cleanupFilter = {
      surveyId: filters.surveyId,
      dateRange:
        filters.startDate && filters.endDate
          ? { start: new Date(filters.startDate), end: new Date(filters.endDate) }
          : undefined,
      exportStatus: filters.exportStatus,
      surveyStatus: filters.surveyStatus,
    };
    return this.dataCleanupService.getCleanupCandidates(cleanupFilter);
  }

  @Post('gdpr/:respondentId')
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePersonalData(
    @Param('respondentId') respondentId: string,
    @Body() dto: GdprDeleteDto,
    @Req() req: any,
  ) {
    const adminUserId = req.user.userId;
    const ipAddress = req.ip || req.connection?.remoteAddress || '0.0.0.0';
    await this.dataCleanupService.deletePersonalData(
      respondentId,
      dto.superAdminApproval,
      adminUserId,
      ipAddress,
    );
  }

  @Post('purge-config')
  async configureScheduledPurge(@Body() dto: PurgeConfigDto) {
    return this.dataCleanupService.configureScheduledPurge(dto);
  }
}
