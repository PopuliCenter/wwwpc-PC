import {
  Controller,
  Get,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OptionRandomizerService } from './services/option-randomizer';
import { SurveyTimeService } from './services/survey-time.service';
import { JwtAuthGuard } from '@modules/auth/guards';
import { SurveyAccessResultDto } from './dto/survey-access-result.dto';
import { Question } from './entities/question.entity';

@Controller('surveys')
@UseGuards(JwtAuthGuard)
export class SurveyRespondentController {
  constructor(
    private readonly optionRandomizerService: OptionRandomizerService,
    private readonly surveyTimeService: SurveyTimeService,
  ) {}

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
