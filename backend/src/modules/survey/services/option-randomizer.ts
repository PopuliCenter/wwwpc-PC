import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Question } from '../entities/question.entity';
import { QuestionOption } from '../entities/question-option.entity';
import { Survey } from '../entities/survey.entity';

@Injectable()
export class OptionRandomizerService {
  private readonly logger = new Logger(OptionRandomizerService.name);

  constructor(
    @InjectRepository(Question)
    private readonly questionRepository: Repository<Question>,
    @InjectRepository(Survey)
    private readonly surveyRepository: Repository<Survey>,
  ) {}

  /**
   * Fisher-Yates shuffle algorithm.
   * Returns a new array with the same elements in a random order.
   * Does not mutate the original array.
   */
  shuffleOptions(options: QuestionOption[]): QuestionOption[] {
    const shuffled = [...options];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Returns questions for a survey with options shuffled if randomizeOptions is enabled.
   * If randomizeOptions is false, returns questions with original option order.
   */
  async getRandomizedQuestions(surveyId: string): Promise<Question[]> {
    const survey = await this.surveyRepository.findOne({
      where: { id: surveyId },
    });

    if (!survey) {
      throw new NotFoundException(`Survey with id ${surveyId} not found`);
    }

    const questions = await this.questionRepository.find({
      where: { surveyId },
      relations: ['options'],
      order: { orderIndex: 'ASC' },
    });

    if (!survey.randomizeOptions) {
      return questions;
    }

    return questions.map((question) => ({
      ...question,
      options: this.shuffleOptions(question.options),
    }));
  }
}
