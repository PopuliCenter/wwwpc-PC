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
import { UserRole } from '@shared/enums';
import { Survey } from './entities/survey.entity';

@Controller('surveys')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class SurveyController {
  constructor(private readonly surveyService: SurveyService) {}

  @Get()
  async findAll(): Promise<Survey[]> {
    return this.surveyService.findAll();
  }

  /** Daftar survei aktif untuk responden. Harus DI ATAS @Get(':id'). */
  @Get('available')
  @Roles(UserRole.RESPONDENT, UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async getAvailableSurveys(@Request() req: any) {
    // Filter kelayakan hanya untuk responden; admin/analis melihat semua.
    const respondentId =
      req.user?.role === UserRole.RESPONDENT ? req.user.userId : undefined;
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
  async createSurvey(
    @Request() req: any,
    @Body() dto: CreateSurveyDto,
  ): Promise<Survey> {
    return this.surveyService.createSurvey(req.user.userId, dto);
  }

  @Put(':id')
  async updateSurvey(
    @Param('id') id: string,
    @Body() dto: UpdateSurveyDto,
  ): Promise<Survey> {
    return this.surveyService.updateSurvey(id, dto);
  }

  @Post(':id/duplicate')
  @HttpCode(HttpStatus.CREATED)
  async duplicateSurvey(
    @Request() req: any,
    @Param('id') id: string,
  ): Promise<Survey> {
    return this.surveyService.duplicateSurvey(id, req.user.userId);
  }

  @Put(':id/activate')
  async activateSurvey(@Param('id') id: string): Promise<Survey> {
    return this.surveyService.activateSurvey(id);
  }

  @Put(':id/deactivate')
  async deactivateSurvey(@Param('id') id: string): Promise<Survey> {
    return this.surveyService.deactivateSurvey(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSurvey(@Param('id') id: string): Promise<void> {
    return this.surveyService.deleteSurvey(id);
  }

  @Put(':id/archive')
  async archiveSurvey(@Param('id') id: string): Promise<Survey> {
    return this.surveyService.archiveSurvey(id);
  }
}
