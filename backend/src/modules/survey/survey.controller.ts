import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SurveyService } from './survey.service';
import { CreateSurveyDto } from './dto/create-survey.dto';
import { UpdateSurveyDto } from './dto/update-survey.dto';
import { JwtAuthGuard, RolesGuard } from '@modules/auth/guards';
import { Roles } from '@modules/auth/decorators';
import { UserRole, AuditActionType } from '@shared/enums';
import { Survey } from './entities/survey.entity';
import { AuditService } from '@modules/audit/audit.service';
import { NotificationSchedulerService } from '@modules/notification/scheduled';
import { TargetCriteriaDto } from './dto/target-criteria.dto';

/** Ambil IP klien dari request (hormati proxy bila ada). */
function clientIp(req: any): string {
  return (
    (req?.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req?.ip || 'unknown'
  );
}

@Controller('surveys')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class SurveyController {
  constructor(
    private readonly surveyService: SurveyService,
    private readonly auditService: AuditService,
    private readonly notificationScheduler: NotificationSchedulerService,
  ) {}

  /** Catat aksi survei ke audit log (best-effort di AuditService). */
  private audit(
    req: any,
    actionType: AuditActionType,
    survey: { id: string; title?: string },
    extra?: Record<string, any>,
  ): Promise<void> {
    return this.auditService.log({
      userId: req.user.userId,
      actionType,
      module: 'survey',
      details: { surveyId: survey.id, title: survey.title, ...extra },
      ipAddress: clientIp(req),
    });
  }

  @Get()
  async findAll(): Promise<Survey[]> {
    return this.surveyService.findAll();
  }

  /** Daftar survei aktif untuk responden. Harus DI ATAS @Get(':id'). */
  @Get('available')
  @Roles(UserRole.RESPONDENT, UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async getAvailableSurveys(@Request() req: any) {
    // Filter kelayakan hanya untuk responden; admin/analis melihat semua.
    const respondentId = req.user?.role === UserRole.RESPONDENT ? req.user.userId : undefined;
    return this.surveyService.getAvailableSurveys(respondentId);
  }

  /** Ringkasan/analitik survei (admin & analis). Di atas @Get(':id'). */
  @Get(':id/summary')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ANALYST)
  async getSummary(@Param('id') id: string) {
    return this.surveyService.getSurveySummary(id);
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<Survey> {
    return this.surveyService.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createSurvey(@Request() req: any, @Body() dto: CreateSurveyDto): Promise<Survey> {
    const survey = await this.surveyService.createSurvey(req.user.userId, dto);
    await this.audit(req, AuditActionType.SURVEY_CREATE, survey);
    return survey;
  }

  @Put(':id')
  async updateSurvey(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateSurveyDto,
  ): Promise<Survey> {
    const survey = await this.surveyService.updateSurvey(id, dto);
    await this.audit(req, AuditActionType.SURVEY_UPDATE, survey);
    return survey;
  }

  @Post(':id/duplicate')
  @HttpCode(HttpStatus.CREATED)
  async duplicateSurvey(@Request() req: any, @Param('id') id: string): Promise<Survey> {
    const survey = await this.surveyService.duplicateSurvey(id, req.user.userId);
    await this.audit(req, AuditActionType.SURVEY_CREATE, survey, {
      duplicatedFrom: id,
    });
    return survey;
  }

  @Put(':id/activate')
  async activateSurvey(@Request() req: any, @Param('id') id: string): Promise<Survey> {
    const survey = await this.surveyService.activateSurvey(id);
    await this.audit(req, AuditActionType.SURVEY_UPDATE, survey, { action: 'activate' });
    return survey;
  }

  /**
   * Kirim email undangan "survei baru" ke responden yang BELUM mengisi survei
   * ini (manual, ditekan admin). Survei harus aktif. Mengembalikan jumlah penerima.
   */
  @Post(':id/invitations')
  @HttpCode(HttpStatus.OK)
  async sendInvitations(
    @Request() req: any,
    @Param('id') id: string,
  ): Promise<{ recipients: number; pushed: number }> {
    const result = await this.notificationScheduler.sendInvitationsForSurvey(id);
    await this.audit(
      req,
      AuditActionType.NOTIFICATION_SENT,
      { id },
      {
        kind: 'survey_invitation',
        recipients: result.recipients,
        pushed: result.pushed,
      },
    );
    return result;
  }

  /**
   * Pratinjau jumlah responden yang COCOK kriteria & belum mengisi survei
   * (sebelum kirim undangan bertarget). Tidak mengirim apa pun.
   */
  @Post(':id/target-preview')
  @HttpCode(HttpStatus.OK)
  async targetPreview(
    @Param('id') id: string,
    @Body() criteria: TargetCriteriaDto,
  ): Promise<{ matching: number }> {
    return this.notificationScheduler.countTargetedAudience(id, criteria);
  }

  /**
   * Kirim undangan BERTARGET (filter kriteria + opsional ambil acak N) ke
   * responden yang belum mengisi. Survei harus aktif.
   */
  @Post(':id/target-invite')
  @HttpCode(HttpStatus.OK)
  async targetInvite(
    @Request() req: any,
    @Param('id') id: string,
    @Body() criteria: TargetCriteriaDto,
  ): Promise<{ recipients: number; pushed: number }> {
    const result = await this.notificationScheduler.sendTargetedInvitations(id, criteria);
    await this.audit(
      req,
      AuditActionType.NOTIFICATION_SENT,
      { id },
      {
        kind: 'survey_invitation_targeted',
        recipients: result.recipients,
        pushed: result.pushed,
      },
    );
    return result;
  }

  @Put(':id/deactivate')
  async deactivateSurvey(@Request() req: any, @Param('id') id: string): Promise<Survey> {
    const survey = await this.surveyService.deactivateSurvey(id);
    await this.audit(req, AuditActionType.SURVEY_UPDATE, survey, { action: 'deactivate' });
    return survey;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSurvey(@Request() req: any, @Param('id') id: string): Promise<void> {
    await this.surveyService.deleteSurvey(id);
    await this.audit(req, AuditActionType.SURVEY_DELETE, { id });
  }

  @Put(':id/archive')
  async archiveSurvey(@Request() req: any, @Param('id') id: string): Promise<Survey> {
    const survey = await this.surveyService.archiveSurvey(id);
    await this.audit(req, AuditActionType.SURVEY_ARCHIVE, survey);
    return survey;
  }
}
