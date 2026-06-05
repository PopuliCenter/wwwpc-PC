import {
  Controller,
  Get,
  Param,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OptionRandomizerService } from './services/option-randomizer';
import { SurveyTimeService } from './services/survey-time.service';
import { SurveyFillService, SurveyFillData } from './services/survey-fill.service';
import { JwtAuthGuard, RolesGuard } from '@modules/auth/guards';
import { Roles } from '@modules/auth/decorators';
import { UserRole } from '@shared/enums';
import { SurveyAccessResultDto } from './dto/survey-access-result.dto';
import { Question } from './entities/question.entity';

@Controller('surveys')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SurveyRespondentController {
  constructor(
    private readonly optionRandomizerService: OptionRandomizerService,
    private readonly surveyTimeService: SurveyTimeService,
    private readonly surveyFillService: SurveyFillService,
  ) {}

  /**
   * Aggregate payload the respondent UI needs to render and fill a survey.
   * Creates or resumes the respondent's in-progress response (so started_at is
   * server-recorded) and returns its id as responseId.
   */
  @Get(':surveyId/fill')
  @Roles(UserRole.RESPONDENT)
  @HttpCode(HttpStatus.OK)
  async getFillData(
    @Param('surveyId') surveyId: string,
    @Request() req: any,
  ): Promise<SurveyFillData> {
    return this.surveyFillService.getFillData(surveyId, req.user.userId);
  }

  @Get(':surveyId/access-check')
  @HttpCode(HttpStatus.OK)
  async checkAccess(
    @Param('surveyId') surveyId: string,
  ): Promise<SurveyAccessResultDto> {
    return this.surveyTimeService.checkSurveyAccess(surveyId);
  }

  @Get(':surveyId/questions/randomized')
  @HttpCode(HttpStatus.OK)
  async getRandomizedQuestions(
    @Param('surveyId') surveyId: string,
  ): Promise<Question[]> {
    return this.optionRandomizerService.getRandomizedQuestions(surveyId);
  }
}
