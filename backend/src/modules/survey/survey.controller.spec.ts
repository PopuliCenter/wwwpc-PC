import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { SurveyController } from './survey.controller';
import { SurveyService } from './survey.service';
import { SurveyStatus } from '@shared/enums';
import { CreateSurveyDto } from './dto/create-survey.dto';
import { UpdateSurveyDto } from './dto/update-survey.dto';

describe('SurveyController', () => {
  let controller: SurveyController;
  let surveyService: any;

  const mockSurvey = {
    id: 'survey-uuid-1',
    createdBy: 'user-uuid-1',
    title: 'Test Survey',
    description: 'A test survey',
    status: SurveyStatus.DRAFT,
    rewardMode: 'automatic' as const,
    startDatetime: new Date('2025-01-01T00:00:00Z'),
    endDatetime: new Date('2025-02-01T00:00:00Z'),
    maxDurationMinutes: 30,
    maxRespondents: 100,
    randomizeOptions: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
    timeConfig: null,
    rewardConfig: null,
  };

  beforeEach(async () => {
    surveyService = {
      createSurvey: vi.fn().mockResolvedValue(mockSurvey),
      updateSurvey: vi.fn().mockResolvedValue(mockSurvey),
      duplicateSurvey: vi.fn().mockResolvedValue({ ...mockSurvey, id: 'survey-uuid-2', title: 'Test Survey (Copy)' }),
      deactivateSurvey: vi.fn().mockResolvedValue({ ...mockSurvey, status: SurveyStatus.INACTIVE }),
      deleteSurvey: vi.fn().mockResolvedValue(undefined),
      archiveSurvey: vi.fn().mockResolvedValue({ ...mockSurvey, status: SurveyStatus.ARCHIVED, archivedAt: new Date() }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SurveyController],
      providers: [
        { provide: SurveyService, useValue: surveyService },
      ],
    }).compile();

    controller = module.get<SurveyController>(SurveyController);
  });

  describe('createSurvey', () => {
    it('should call service.createSurvey with userId and dto', async () => {
      const req = { user: { userId: 'user-uuid-1' } };
      const dto: CreateSurveyDto = {
        title: 'Test Survey',
        rewardMode: 'automatic',
      };

      const result = await controller.createSurvey(req, dto);

      expect(surveyService.createSurvey).toHaveBeenCalledWith('user-uuid-1', dto);
      expect(result).toEqual(mockSurvey);
    });
  });

  describe('updateSurvey', () => {
    it('should call service.updateSurvey with id and dto', async () => {
      const dto: UpdateSurveyDto = { title: 'Updated' };

      const result = await controller.updateSurvey('survey-uuid-1', dto);

      expect(surveyService.updateSurvey).toHaveBeenCalledWith('survey-uuid-1', dto);
      expect(result).toEqual(mockSurvey);
    });
  });

  describe('duplicateSurvey', () => {
    it('should call service.duplicateSurvey with id and userId', async () => {
      const req = { user: { userId: 'user-uuid-1' } };

      const result = await controller.duplicateSurvey(req, 'survey-uuid-1');

      expect(surveyService.duplicateSurvey).toHaveBeenCalledWith('survey-uuid-1', 'user-uuid-1');
      expect(result.title).toBe('Test Survey (Copy)');
    });
  });

  describe('deactivateSurvey', () => {
    it('should call service.deactivateSurvey with id', async () => {
      const result = await controller.deactivateSurvey('survey-uuid-1');

      expect(surveyService.deactivateSurvey).toHaveBeenCalledWith('survey-uuid-1');
      expect(result.status).toBe(SurveyStatus.INACTIVE);
    });
  });

  describe('deleteSurvey', () => {
    it('should call service.deleteSurvey with id', async () => {
      await controller.deleteSurvey('survey-uuid-1');

      expect(surveyService.deleteSurvey).toHaveBeenCalledWith('survey-uuid-1');
    });
  });

  describe('archiveSurvey', () => {
    it('should call service.archiveSurvey with id', async () => {
      const result = await controller.archiveSurvey('survey-uuid-1');

      expect(surveyService.archiveSurvey).toHaveBeenCalledWith('survey-uuid-1');
      expect(result.status).toBe(SurveyStatus.ARCHIVED);
      expect(result.archivedAt).toBeDefined();
    });
  });
});
