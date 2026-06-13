import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard, RolesGuard } from '@modules/auth/guards';
import { Roles } from '@modules/auth/decorators';
import { UserRole } from '@shared/enums';
import { SurveyorService } from './surveyor.service';
import { SubmitSurveyorResponseDto } from './dto/submit-surveyor-response.dto';

/** Endpoint untuk surveyor (TPD): survei saya, nomor saya, pengisian lapangan. */
@Controller('surveyor')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SURVEYOR)
export class SurveyorController {
  constructor(private readonly surveyorService: SurveyorService) {}

  @Get('surveys')
  async mySurveys(@Request() req: any) {
    return this.surveyorService.getMySurveys(req.user.userId);
  }

  @Get('surveys/:surveyId/numbers')
  async myNumbers(
    @Param('surveyId') surveyId: string,
    @Request() req: any,
  ) {
    return this.surveyorService.getMyNumbers(surveyId, req.user.userId);
  }

  @Get('surveys/:surveyId/fill')
  async fillData(
    @Param('surveyId') surveyId: string,
    @Request() req: any,
  ) {
    return this.surveyorService.getFillData(surveyId, req.user.userId);
  }

  @Post('surveys/:surveyId/responses')
  @HttpCode(HttpStatus.CREATED)
  async submit(
    @Param('surveyId') surveyId: string,
    @Body() dto: SubmitSurveyorResponseDto,
    @Request() req: any,
  ) {
    return this.surveyorService.submitResponse(surveyId, req.user.userId, dto);
  }
}
