import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Not, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { NotificationService } from '../notification.service';
import { Survey } from '@modules/survey/entities/survey.entity';
import { SurveyResponse } from '@modules/response/entities/survey-response.entity';
import { User } from '@modules/auth/entities/user.entity';
import { SurveyStatus } from '@shared/enums';

@Injectable()
export class NotificationSchedulerService {
  private readonly logger = new Logger(NotificationSchedulerService.name);
  private readonly baseUrl: string;

  constructor(
    private readonly notificationService: NotificationService,
    private readonly configService: ConfigService,
    @InjectRepository(Survey)
    private readonly surveyRepository: Repository<Survey>,
    @InjectRepository(SurveyResponse)
    private readonly responseRepository: Repository<SurveyResponse>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {
    this.baseUrl = this.configService.get<string>('APP_BASE_URL') ?? 'http://localhost:3000';
  }

  /**
   * Run daily at 9:00 AM to send H-3 reminders
   * Finds active surveys with deadline in exactly 3 days and sends reminders
   * to respondents who haven't filled them yet.
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async sendH3Reminders(): Promise<void> {
    this.logger.log('Running H-3 reminder job...');

    try {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 3);

      const surveys = await this.findSurveysWithDeadlineOn(targetDate);

      for (const survey of surveys) {
        const pendingRespondents = await this.findRespondentsWhoHaventFilled(survey.id);

        if (pendingRespondents.length > 0) {
          await this.notificationService.sendReminder(
            pendingRespondents,
            {
              title: survey.title,
              endDatetime: survey.endDatetime?.toISOString() ?? '',
              id: survey.id,
            },
            3,
            this.baseUrl,
          );
          this.logger.log(`Sent H-3 reminders for survey "${survey.title}" to ${pendingRespondents.length} respondents`);
        }
      }

      this.logger.log(`H-3 reminder job completed. Processed ${surveys.length} surveys.`);
    } catch (error: any) {
      this.logger.error(`H-3 reminder job failed: ${error.message}`, error.stack);
    }
  }

  /**
   * Run daily at 9:00 AM to send H-1 reminders
   * Finds active surveys with deadline in exactly 1 day and sends reminders
   * to respondents who haven't filled them yet.
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async sendH1Reminders(): Promise<void> {
    this.logger.log('Running H-1 reminder job...');

    try {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 1);

      const surveys = await this.findSurveysWithDeadlineOn(targetDate);

      for (const survey of surveys) {
        const pendingRespondents = await this.findRespondentsWhoHaventFilled(survey.id);

        if (pendingRespondents.length > 0) {
          await this.notificationService.sendReminder(
            pendingRespondents,
            {
              title: survey.title,
              endDatetime: survey.endDatetime?.toISOString() ?? '',
              id: survey.id,
            },
            1,
            this.baseUrl,
          );
          this.logger.log(`Sent H-1 reminders for survey "${survey.title}" to ${pendingRespondents.length} respondents`);
        }
      }

      this.logger.log(`H-1 reminder job completed. Processed ${surveys.length} surveys.`);
    } catch (error: any) {
      this.logger.error(`H-1 reminder job failed: ${error.message}`, error.stack);
    }
  }

  /**
   * Find active surveys whose end_datetime falls on the target date
   */
  private async findSurveysWithDeadlineOn(targetDate: Date): Promise<Survey[]> {
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    return this.surveyRepository.find({
      where: {
        status: SurveyStatus.ACTIVE,
        endDatetime: Between(startOfDay, endOfDay),
      },
    });
  }

  /**
   * Find respondents who are eligible but haven't submitted a response for the given survey.
   * Returns respondents with verified email and completed profile who don't have a response.
   */
  private async findRespondentsWhoHaventFilled(
    surveyId: string,
  ): Promise<Array<{ email: string; fullName: string }>> {
    // Get IDs of respondents who already have a response (any status)
    const existingResponses = await this.responseRepository.find({
      where: { surveyId },
      select: ['respondentId'],
    });
    const respondedIds = existingResponses.map((r) => r.respondentId);

    // Find all eligible respondents who haven't responded
    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .select(['user.email', 'user.fullName'])
      .where('user.emailVerified = :verified', { verified: true })
      .andWhere('user.profileCompleted = :completed', { completed: true })
      .andWhere('user.status = :status', { status: 'active' })
      .andWhere('user.role = :role', { role: 'respondent' });

    if (respondedIds.length > 0) {
      queryBuilder.andWhere('user.id NOT IN (:...respondedIds)', { respondedIds });
    }

    return queryBuilder.getMany();
  }
}
