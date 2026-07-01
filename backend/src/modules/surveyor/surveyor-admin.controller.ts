import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard, RolesGuard } from '@modules/auth/guards';
import { Roles } from '@modules/auth/decorators';
import { UserRole } from '@shared/enums';
import { SurveyorService } from './surveyor.service';
import { AssignSurveyorDto } from './dto/assign-surveyor.dto';
import { UpdateSurveyorQuotaDto } from './dto/update-surveyor-quota.dto';
import { AssignNumbersDto } from './dto/assign-numbers.dto';

/** Pengelolaan penugasan surveyor (TPD) pada survei — khusus admin. */
@Controller('surveys/:surveyId/surveyors')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class SurveyorAdminController {
  constructor(private readonly surveyorService: SurveyorService) {}

  @Get()
  async list(@Param('surveyId') surveyId: string) {
    return this.surveyorService.listSurveyors(surveyId);
  }

  /** Pengguna ber-role surveyor yang belum ditugaskan ke survei ini. */
  @Get('available')
  async available(@Param('surveyId') surveyId: string) {
    return this.surveyorService.listAvailableSurveyors(surveyId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async assign(@Param('surveyId') surveyId: string, @Body() dto: AssignSurveyorDto) {
    return this.surveyorService.assignSurveyor(surveyId, dto);
  }

  @Put(':surveyorId')
  async update(
    @Param('surveyId') surveyId: string,
    @Param('surveyorId') surveyorId: string,
    @Body() dto: UpdateSurveyorQuotaDto,
  ) {
    return this.surveyorService.updateQuota(surveyId, surveyorId, dto);
  }

  @Post(':surveyorId/assign-numbers')
  async assignNumbers(
    @Param('surveyId') surveyId: string,
    @Param('surveyorId') surveyorId: string,
    @Body() dto: AssignNumbersDto,
  ) {
    return this.surveyorService.assignNumbers(surveyId, surveyorId, dto.numbers);
  }

  @Delete(':surveyorId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('surveyId') surveyId: string,
    @Param('surveyorId') surveyorId: string,
  ): Promise<void> {
    return this.surveyorService.removeSurveyor(surveyId, surveyorId);
  }
}
