import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SurveyService } from './survey.service';
import { SurveyController } from './survey.controller';
import { QuestionService } from './question.service';
import { QuestionController } from './question.controller';
import { ConditionalLogicController } from './conditional-logic.controller';
import { SurveyRespondentController } from './survey-respondent.controller';
import { SkipLogicService } from './services/skip-logic.service';
import { VisibilityService } from './services/visibility.service';
import { BranchingService } from './services/branching.service';
import { OptionRandomizerService } from './services/option-randomizer';
import { SurveyTimeService } from './services/survey-time.service';
import { AnswerValidationService } from './services/answer-validation.service';
import { SurveyFillService } from './services/survey-fill.service';
import { Survey } from './entities/survey.entity';
import { SurveyPage } from './entities/survey-page.entity';
import { SurveyTimeConfig } from './entities/survey-time-config.entity';
import { SurveyRewardConfig } from './entities/survey-reward-config.entity';
import { Question } from './entities/question.entity';
import { QuestionOption } from './entities/question-option.entity';
import { SkipLogicRule } from './entities/skip-logic-rule.entity';
import { VisibilityRule } from './entities/visibility-rule.entity';
import { BranchingRule } from './entities/branching-rule.entity';
import { SurveyResponse } from '@modules/response/entities/survey-response.entity';
import { Answer } from '@modules/response/entities/answer.entity';
import { AuthModule } from '@modules/auth';
import { AuditModule } from '@modules/audit';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Survey,
      SurveyPage,
      SurveyTimeConfig,
      SurveyRewardConfig,
      Question,
      QuestionOption,
      SkipLogicRule,
      VisibilityRule,
      BranchingRule,
      SurveyResponse,
      Answer,
    ]),
    AuthModule,
    AuditModule,
  ],
  controllers: [
    SurveyController,
    QuestionController,
    ConditionalLogicController,
    SurveyRespondentController,
  ],
  providers: [
    SurveyService,
    QuestionService,
    SkipLogicService,
    VisibilityService,
    BranchingService,
    OptionRandomizerService,
    SurveyTimeService,
    AnswerValidationService,
    SurveyFillService,
  ],
  exports: [
    SurveyService,
    QuestionService,
    SkipLogicService,
    VisibilityService,
    BranchingService,
    OptionRandomizerService,
    SurveyTimeService,
    AnswerValidationService,
    SurveyFillService,
  ],
})
export class SurveyModule {}
