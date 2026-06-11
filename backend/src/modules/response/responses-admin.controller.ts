import {
  Controller,
  Get,
  Post,
  Body,
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
import { UserRole } from '@shared/enums';

/**
 * Daftar respons LINTAS-SURVEI untuk panel admin (yang dipanggil
 * frontend ResponseListPage via GET /responses).
 */
@Controller('responses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ResponsesAdminController {
  constructor(private readonly responseService: ResponseService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ANALYST)
  async list(@Query() filters: AllResponsesFilterDto) {
    return this.responseService.getAllResponses(filters);
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
