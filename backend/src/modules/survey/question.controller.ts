import {
  Controller,
  Post,
  Put,
  Delete,
  Get,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { QuestionService } from './question.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { ReorderQuestionsDto } from './dto/reorder-questions.dto';
import { BulkQuestionsDto } from './dto/bulk-questions.dto';
import { JwtAuthGuard, RolesGuard } from '@modules/auth/guards';
import { Roles } from '@modules/auth/decorators';
import { UserRole } from '@shared/enums';
import { Question } from './entities/question.entity';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class QuestionController {
  constructor(private readonly questionService: QuestionService) {}

  @Post('surveys/:surveyId/questions')
  @HttpCode(HttpStatus.CREATED)
  async addQuestion(
    @Param('surveyId') surveyId: string,
    @Body() dto: CreateQuestionDto,
  ): Promise<Question> {
    return this.questionService.addQuestion(surveyId, dto);
  }

  /** Ganti seluruh pertanyaan survei sekaligus (tombol "Simpan" di builder). */
  @Put('surveys/:surveyId/questions')
  async bulkReplaceQuestions(
    @Param('surveyId') surveyId: string,
    @Body() dto: BulkQuestionsDto,
  ): Promise<Question[]> {
    return this.questionService.bulkReplaceQuestions(surveyId, dto.questions);
  }

  @Put('questions/:id')
  async updateQuestion(@Param('id') id: string, @Body() dto: UpdateQuestionDto): Promise<Question> {
    return this.questionService.updateQuestion(id, dto);
  }

  @Delete('questions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteQuestion(@Param('id') id: string): Promise<void> {
    return this.questionService.deleteQuestion(id);
  }

  @Put('surveys/:surveyId/questions/reorder')
  async reorderQuestions(
    @Param('surveyId') surveyId: string,
    @Body() dto: ReorderQuestionsDto,
  ): Promise<void> {
    return this.questionService.reorderQuestions(surveyId, dto);
  }

  @Get('surveys/:surveyId/questions')
  async getQuestionsBySurvey(@Param('surveyId') surveyId: string): Promise<Question[]> {
    return this.questionService.getQuestionsBySurvey(surveyId);
  }
}
