import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Survey } from './entities/survey.entity';
import { SurveyTimeConfig } from './entities/survey-time-config.entity';
import { SurveyRewardConfig } from './entities/survey-reward-config.entity';
import { CreateSurveyDto } from './dto/create-survey.dto';
import { UpdateSurveyDto } from './dto/update-survey.dto';
import { SurveyStatus } from '@shared/enums';

@Injectable()
export class SurveyService {
  private readonly logger = new Logger(SurveyService.name);

  constructor(
    @InjectRepository(Survey)
    private readonly surveyRepository: Repository<Survey>,
    @InjectRepository(SurveyTimeConfig)
    private readonly timeConfigRepository: Repository<SurveyTimeConfig>,
    @InjectRepository(SurveyRewardConfig)
    private readonly rewardConfigRepository: Repository<SurveyRewardConfig>,
  ) {}

  async findAll(): Promise<Survey[]> {
    return this.surveyRepository.find({
      order: { createdAt: 'DESC' },
      relations: ['timeConfig', 'rewardConfig'],
    });
  }

  async createSurvey(userId: string, dto: CreateSurveyDto): Promise<Survey> {
    const survey = this.surveyRepository.create({
      createdBy: userId,
      title: dto.title,
      description: dto.description || null,
      rewardMode: dto.rewardMode,
      randomizeOptions: dto.randomizeOptions ?? false,
      startDatetime: dto.timeConfig?.startDatetime
        ? new Date(dto.timeConfig.startDatetime)
        : null,
      endDatetime: dto.timeConfig?.endDatetime
        ? new Date(dto.timeConfig.endDatetime)
        : null,
      maxDurationMinutes: dto.timeConfig?.maxDurationMinutes ?? null,
      maxRespondents: dto.timeConfig?.maxRespondents ?? null,
      status: SurveyStatus.DRAFT,
    });

    const savedSurvey = await this.surveyRepository.save(survey);

    // Create time config
    const timeConfig = this.timeConfigRepository.create({
      surveyId: savedSurvey.id,
      startDatetime: dto.timeConfig?.startDatetime
        ? new Date(dto.timeConfig.startDatetime)
        : null,
      endDatetime: dto.timeConfig?.endDatetime
        ? new Date(dto.timeConfig.endDatetime)
        : null,
      maxDurationMinutes: dto.timeConfig?.maxDurationMinutes ?? null,
      maxRespondents: dto.timeConfig?.maxRespondents ?? null,
      currentRespondentCount: 0,
    });
    await this.timeConfigRepository.save(timeConfig);

    // Create reward config
    const rewardConfig = this.rewardConfigRepository.create({
      surveyId: savedSurvey.id,
      rewardMode: dto.rewardMode,
      pointsValue: dto.rewardConfig?.pointsValue ?? null,
      manualRewardType: dto.rewardConfig?.manualRewardType ?? null,
      manualRewardNominal: dto.rewardConfig?.manualRewardNominal ?? null,
    });
    await this.rewardConfigRepository.save(rewardConfig);

    this.logger.log(`Survey created: ${savedSurvey.id} by user ${userId}`);

    return this.findById(savedSurvey.id);
  }

  async updateSurvey(surveyId: string, dto: UpdateSurveyDto): Promise<Survey> {
    const survey = await this.findById(surveyId);

    // Update survey fields
    if (dto.title !== undefined) survey.title = dto.title;
    if (dto.description !== undefined) survey.description = dto.description;
    if (dto.rewardMode !== undefined) survey.rewardMode = dto.rewardMode;
    if (dto.randomizeOptions !== undefined) survey.randomizeOptions = dto.randomizeOptions;

    // Update time-related fields on survey
    if (dto.timeConfig) {
      if (dto.timeConfig.startDatetime !== undefined) {
        survey.startDatetime = dto.timeConfig.startDatetime
          ? new Date(dto.timeConfig.startDatetime)
          : null;
      }
      if (dto.timeConfig.endDatetime !== undefined) {
        survey.endDatetime = dto.timeConfig.endDatetime
          ? new Date(dto.timeConfig.endDatetime)
          : null;
      }
      if (dto.timeConfig.maxDurationMinutes !== undefined) {
        survey.maxDurationMinutes = dto.timeConfig.maxDurationMinutes;
      }
      if (dto.timeConfig.maxRespondents !== undefined) {
        survey.maxRespondents = dto.timeConfig.maxRespondents;
      }
    }

    await this.surveyRepository.save(survey);

    // Update time config
    if (dto.timeConfig) {
      const timeConfig = await this.timeConfigRepository.findOne({
        where: { surveyId },
      });
      if (timeConfig) {
        if (dto.timeConfig.startDatetime !== undefined) {
          timeConfig.startDatetime = dto.timeConfig.startDatetime
            ? new Date(dto.timeConfig.startDatetime)
            : null;
        }
        if (dto.timeConfig.endDatetime !== undefined) {
          timeConfig.endDatetime = dto.timeConfig.endDatetime
            ? new Date(dto.timeConfig.endDatetime)
            : null;
        }
        if (dto.timeConfig.maxDurationMinutes !== undefined) {
          timeConfig.maxDurationMinutes = dto.timeConfig.maxDurationMinutes;
        }
        if (dto.timeConfig.maxRespondents !== undefined) {
          timeConfig.maxRespondents = dto.timeConfig.maxRespondents;
        }
        await this.timeConfigRepository.save(timeConfig);
      }
    }

    // Update reward config
    if (dto.rewardConfig || dto.rewardMode !== undefined) {
      const rewardConfig = await this.rewardConfigRepository.findOne({
        where: { surveyId },
      });
      if (rewardConfig) {
        if (dto.rewardMode !== undefined) {
          rewardConfig.rewardMode = dto.rewardMode;
        }
        if (dto.rewardConfig?.pointsValue !== undefined) {
          rewardConfig.pointsValue = dto.rewardConfig.pointsValue;
        }
        if (dto.rewardConfig?.manualRewardType !== undefined) {
          rewardConfig.manualRewardType = dto.rewardConfig.manualRewardType;
        }
        if (dto.rewardConfig?.manualRewardNominal !== undefined) {
          rewardConfig.manualRewardNominal = dto.rewardConfig.manualRewardNominal;
        }
        await this.rewardConfigRepository.save(rewardConfig);
      }
    }

    this.logger.log(`Survey updated: ${surveyId}`);

    return this.findById(surveyId);
  }

  async duplicateSurvey(surveyId: string, userId: string): Promise<Survey> {
    const original = await this.findById(surveyId);

    const duplicateDto: CreateSurveyDto = {
      title: `${original.title} (Copy)`,
      description: original.description ?? undefined,
      rewardMode: original.rewardMode,
      randomizeOptions: original.randomizeOptions,
      timeConfig: {
        startDatetime: original.timeConfig?.startDatetime?.toISOString(),
        endDatetime: original.timeConfig?.endDatetime?.toISOString(),
        maxDurationMinutes: original.timeConfig?.maxDurationMinutes ?? undefined,
        maxRespondents: original.timeConfig?.maxRespondents ?? undefined,
      },
      rewardConfig: {
        rewardMode: original.rewardConfig?.rewardMode ?? original.rewardMode,
        pointsValue: original.rewardConfig?.pointsValue ?? undefined,
        manualRewardType: original.rewardConfig?.manualRewardType ?? undefined,
        manualRewardNominal: original.rewardConfig?.manualRewardNominal
          ? Number(original.rewardConfig.manualRewardNominal)
          : undefined,
      },
    };

    this.logger.log(`Survey duplicated from: ${surveyId} by user ${userId}`);

    return this.createSurvey(userId, duplicateDto);
  }

  async activateSurvey(surveyId: string): Promise<Survey> {
    const survey = await this.findById(surveyId);

    if (survey.status === SurveyStatus.ARCHIVED) {
      throw new BadRequestException('Survei terarsip tidak bisa diaktifkan');
    }

    survey.status = SurveyStatus.ACTIVE;
    await this.surveyRepository.save(survey);

    this.logger.log(`Survey activated: ${surveyId}`);

    return this.findById(surveyId);
  }

  async deactivateSurvey(surveyId: string): Promise<Survey> {
    const survey = await this.findById(surveyId);

    if (survey.status === SurveyStatus.ARCHIVED) {
      throw new BadRequestException('Cannot deactivate an archived survey');
    }

    survey.status = SurveyStatus.INACTIVE;
    await this.surveyRepository.save(survey);

    this.logger.log(`Survey deactivated: ${surveyId}`);

    return this.findById(surveyId);
  }

  async deleteSurvey(surveyId: string): Promise<void> {
    const survey = await this.findById(surveyId);

    await this.surveyRepository.remove(survey);

    this.logger.log(`Survey deleted: ${surveyId}`);
  }

  async archiveSurvey(surveyId: string): Promise<Survey> {
    const survey = await this.findById(surveyId);

    survey.status = SurveyStatus.ARCHIVED;
    survey.archivedAt = new Date();
    await this.surveyRepository.save(survey);

    this.logger.log(`Survey archived: ${surveyId}`);

    return this.findById(surveyId);
  }

  async findById(id: string): Promise<Survey> {
    const survey = await this.surveyRepository.findOne({
      where: { id },
      relations: ['timeConfig', 'rewardConfig'],
    });

    if (!survey) {
      throw new NotFoundException(`Survey with id ${id} not found`);
    }

    return survey;
  }
}
