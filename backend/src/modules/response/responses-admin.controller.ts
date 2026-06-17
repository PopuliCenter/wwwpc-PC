import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ResponseService } from './response.service';
import { AllResponsesFilterDto } from './dto/all-responses-filter.dto';
import { MarkDistributedDto } from './dto/mark-distributed.dto';
import { JwtAuthGuard, RolesGuard } from '@modules/auth/guards';
import { Roles } from '@modules/auth/decorators';
import { UserRole, AuditActionType } from '@shared/enums';
import { AuditService } from '@modules/audit/audit.service';

/** Ambil IP klien dari request (hormati proxy bila ada). */
function clientIp(req: any): string {
  return (
    (req?.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req?.ip ||
    'unknown'
  );
}

/**
 * Daftar respons LINTAS-SURVEI untuk panel admin (yang dipanggil
 * frontend ResponseListPage via GET /responses).
 */
@Controller('responses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ResponsesAdminController {
  constructor(
    private readonly responseService: ResponseService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ANALYST)
  async list(@Query() filters: AllResponsesFilterDto) {
    return this.responseService.getAllResponses(filters);
  }

  /** Detail satu respons (GET /responses/:id). Harus DI BAWAH @Get(). */
  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ANALYST)
  async detail(@Param('id') id: string) {
    return this.responseService.getResponseDetail(id);
  }

  /**
   * Hapus satu respons (DELETE /responses/:id). Membebaskan responden untuk
   * mengisi ulang survei (mis. salah isi / pengisian tertahan). Dicatat di audit.
   */
  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string, @Req() req: any) {
    const result = await this.responseService.deleteResponse(id);
    await this.auditService.log({
      userId: req.user.userId,
      actionType: AuditActionType.DATA_CLEANUP,
      module: 'response',
      details: { kind: 'response_delete', responseId: id, surveyId: result.surveyId },
      ipAddress: clientIp(req),
    });
    return result;
  }
}

/**
 * Rekonsiliasi distribusi reward (top-up) — POST /rewards/mark-distributed.
 */
@Controller('rewards')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RewardDistributionController {
  constructor(private readonly responseService: ResponseService) {}

  @Post('mark-distributed')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async markDistributed(@Body() dto: MarkDistributedDto, @Req() req: any) {
    return this.responseService.markResponsesDistributed(dto.responseIds, req.user.userId);
  }
}
