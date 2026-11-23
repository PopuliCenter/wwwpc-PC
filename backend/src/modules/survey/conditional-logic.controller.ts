import {
  Controller,
  Put,
  Post,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SkipLogicService } from './services/skip-logic.service';
import { VisibilityService } from './services/visibility.service';
import { BranchingService } from './services/branching.service';
import { SetSkipLogicDto } from './dto/set-skip-logic.dto';
import { SetVisibilityDto } from './dto/set-visibility.dto';
import { SetBranchingDto } from './dto/set-branching.dto';
import { EvaluateLogicDto } from './dto/evaluate-logic.dto';
import { JwtAuthGuard, RolesGuard } from '@modules/auth/guards';
import { Roles } from '@modules/auth/decorators';
import { UserRole } from '@shared/enums';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ConditionalLogicController {
  constructor(
    private readonly skipLogicService: SkipLogicService,
    private readonly visibilityService: VisibilityService,
    private readonly branchingService: BranchingService,
  ) {}

  // --- Admin endpoints for setting rules ---

  @Put('questions/:questionId/skip-logic')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async setSkipLogic(@Param('questionId') questionId: string, @Body() dto: SetSkipLogicDto) {
    return this.skipLogicService.setSkipLogicRules(questionId, dto.rules);
  }

  @Put('questions/:questionId/visibility-rules')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async setVisibilityRules(@Param('questionId') questionId: string, @Body() dto: SetVisibilityDto) {
    return this.visibilityService.setVisibilityRules(questionId, dto.rules);
  }

  @Put('pages/:pageId/branching-rules')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async setBranchingRules(@Param('pageId') pageId: string, @Body() dto: SetBranchingDto) {
    return this.branchingService.setBranchingRules(pageId, dto.rules);
  }

  // --- Evaluation endpoints (staf saja) ---
  // Klien responden mengevaluasi logika secara lokal (frontend/utils/
  // surveyBranching.ts), jadi endpoint ini dibatasi ke staf agar tak bisa dipakai
  // membaca struktur/aturan survei DRAFT atau nonaktif (audit T-14).

  @Post('surveys/:surveyId/evaluate-skip-logic')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ANALYST)
  @HttpCode(HttpStatus.OK)
  async evaluateSkipLogic(@Param('surveyId') surveyId: string, @Body() dto: EvaluateLogicDto) {
    const skippedQuestionIds = await this.skipLogicService.evaluateSkipLogic(surveyId, dto.answers);
    return { skippedQuestionIds };
  }

  @Post('surveys/:surveyId/evaluate-visibility')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ANALYST)
  @HttpCode(HttpStatus.OK)
  async evaluateVisibility(@Param('surveyId') surveyId: string, @Body() dto: EvaluateLogicDto) {
    const visibility = await this.visibilityService.evaluateVisibility(surveyId, dto.answers);
    return { visibility };
  }

  @Post('pages/:pageId/evaluate-branching')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ANALYST)
  @HttpCode(HttpStatus.OK)
  async evaluateBranching(@Param('pageId') pageId: string, @Body() dto: EvaluateLogicDto) {
    const targetPageId = await this.branchingService.evaluatePageBranching(pageId, dto.answers);
    return { targetPageId };
  }
}
