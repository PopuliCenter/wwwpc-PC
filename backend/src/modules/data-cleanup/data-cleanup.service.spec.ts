import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PreconditionFailedException, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { DataCleanupService } from './data-cleanup.service';
import { SurveyResponse } from '@modules/response/entities/survey-response.entity';
import { Survey } from '@modules/survey/entities/survey.entity';
import { User } from '@modules/auth/entities/user.entity';
import { UserProfile } from '@modules/registration/entities/user-profile.entity';
import { Geolocation } from '@modules/geolocation/entities/geolocation.entity';
import { ScheduledPurgeConfig } from './entities/scheduled-purge-config.entity';
import { PendingDeletion } from './entities/pending-deletion.entity';
import { AuditService } from '@modules/audit/audit.service';
import { SurveyStatus, UserRole } from '@shared/enums';

describe('DataCleanupService', () => {
  let service: DataCleanupService;
  let responseRepository: any;
  let surveyRepository: any;
  let userRepository: any;
  let userProfileRepository: any;
  let geolocationRepository: any;
  let purgeConfigRepository: any;
  let auditService: any;

  const mockQueryBuilder = {
    andWhere: vi.fn().mockReturnThis(),
    getMany: vi.fn().mockResolvedValue([]),
    getRawMany: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue({ affected: 0 }),
    leftJoin: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    addSelect: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    addGroupBy: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
  };

  beforeEach(async () => {
    // Penyimpanan in-memory stateful untuk meniru tabel pending_deletion.
    const pendingStore = new Map<string, any>();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataCleanupService,
        {
          provide: getRepositoryToken(PendingDeletion),
          useValue: {
            create: vi.fn((data) => data),
            save: vi.fn((entity) => {
              pendingStore.set(entity.id, entity);
              return Promise.resolve(entity);
            }),
            findOne: vi.fn(({ where }) =>
              Promise.resolve(pendingStore.get(where.id) ?? null),
            ),
            delete: vi.fn((criteria) => {
              if (typeof criteria === 'string') pendingStore.delete(criteria);
              return Promise.resolve({ affected: 1 });
            }),
          },
        },
        {
          provide: getRepositoryToken(SurveyResponse),
          useValue: {
            createQueryBuilder: vi.fn().mockReturnValue(mockQueryBuilder),
            findOne: vi.fn(),
          },
        },
        {
          provide: getRepositoryToken(Survey),
          useValue: {
            findOne: vi.fn(),
            save: vi.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: vi.fn(),
            save: vi.fn(),
          },
        },
        {
          provide: getRepositoryToken(UserProfile),
          useValue: {
            delete: vi.fn().mockResolvedValue({ affected: 1 }),
          },
        },
        {
          provide: getRepositoryToken(Geolocation),
          useValue: {
            delete: vi.fn().mockResolvedValue({ affected: 1 }),
          },
        },
        {
          provide: getRepositoryToken(ScheduledPurgeConfig),
          useValue: {
            findOne: vi.fn(),
            create: vi.fn().mockReturnValue({}),
            save: vi.fn().mockImplementation((entity) => Promise.resolve({ id: 'config-1', ...entity })),
          },
        },
        {
          provide: AuditService,
          useValue: {
            log: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<DataCleanupService>(DataCleanupService);
    responseRepository = module.get(getRepositoryToken(SurveyResponse));
    surveyRepository = module.get(getRepositoryToken(Survey));
    userRepository = module.get(getRepositoryToken(User));
    userProfileRepository = module.get(getRepositoryToken(UserProfile));
    geolocationRepository = module.get(getRepositoryToken(Geolocation));
    purgeConfigRepository = module.get(getRepositoryToken(ScheduledPurgeConfig));
    auditService = module.get(AuditService);
  });

  describe('requestDeletion', () => {
    const adminUserId = 'admin-1';
    const ipAddress = '127.0.0.1';
    const request = {
      surveyId: 'survey-1',
      exportStatus: 'exported_only' as const,
      requireDoubleConfirmation: true as const,
    };

    it('should throw PreconditionFailedException if any response is not exported', async () => {
      mockQueryBuilder.getMany.mockResolvedValueOnce([
        { id: 'r1', exportedAt: new Date() },
        { id: 'r2', exportedAt: null },
      ]);

      await expect(
        service.requestDeletion(request, adminUserId, ipAddress),
      ).rejects.toThrow(PreconditionFailedException);
    });

    it('should throw NotFoundException if no responses match criteria', async () => {
      mockQueryBuilder.getMany.mockResolvedValueOnce([]);

      await expect(
        service.requestDeletion(request, adminUserId, ipAddress),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return confirmation token when all responses are exported', async () => {
      mockQueryBuilder.getMany.mockResolvedValueOnce([
        { id: 'r1', exportedAt: new Date() },
        { id: 'r2', exportedAt: new Date() },
      ]);

      const result = await service.requestDeletion(request, adminUserId, ipAddress);

      expect(result.requestId).toBeDefined();
      expect(result.confirmationToken).toBeDefined();
      expect(result.affectedCount).toBe(2);
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(auditService.log).toHaveBeenCalled();
    });
  });

  describe('confirmDeletion', () => {
    const adminUserId = 'admin-1';
    const ipAddress = '127.0.0.1';

    it('should throw NotFoundException for non-existent request', async () => {
      await expect(
        service.confirmDeletion('non-existent', 'token', adminUserId, ipAddress),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for invalid token', async () => {
      // First create a pending deletion
      mockQueryBuilder.getMany.mockResolvedValueOnce([
        { id: 'r1', exportedAt: new Date() },
      ]);

      const request = {
        surveyId: 'survey-1',
        exportStatus: 'exported_only' as const,
        requireDoubleConfirmation: true as const,
      };

      const result = await service.requestDeletion(request, adminUserId, ipAddress);

      await expect(
        service.confirmDeletion(result.requestId, 'wrong-token', adminUserId, ipAddress),
      ).rejects.toThrow(BadRequestException);
    });

    it('should execute deletion with valid token', async () => {
      mockQueryBuilder.getMany.mockResolvedValueOnce([
        { id: 'r1', exportedAt: new Date() },
      ]);
      mockQueryBuilder.execute.mockResolvedValueOnce({ affected: 1 });

      const request = {
        surveyId: 'survey-1',
        exportStatus: 'exported_only' as const,
        requireDoubleConfirmation: true as const,
      };

      const deletionResult = await service.requestDeletion(request, adminUserId, ipAddress);

      const confirmResult = await service.confirmDeletion(
        deletionResult.requestId,
        deletionResult.confirmationToken,
        adminUserId,
        ipAddress,
      );

      expect(confirmResult.deletedCount).toBe(1);
      expect(auditService.log).toHaveBeenCalledTimes(2); // request + confirm
    });
  });

  describe('archiveSurvey', () => {
    const adminUserId = 'admin-1';
    const ipAddress = '127.0.0.1';

    it('should throw NotFoundException if survey does not exist', async () => {
      surveyRepository.findOne.mockResolvedValueOnce(null);

      await expect(
        service.archiveSurvey('non-existent', adminUserId, ipAddress),
      ).rejects.toThrow(NotFoundException);
    });

    it('should archive survey and set archivedAt timestamp', async () => {
      const survey = {
        id: 'survey-1',
        title: 'Test Survey',
        status: SurveyStatus.INACTIVE,
        archivedAt: null,
      };
      surveyRepository.findOne.mockResolvedValueOnce(survey);
      surveyRepository.save.mockResolvedValueOnce(survey);

      await service.archiveSurvey('survey-1', adminUserId, ipAddress);

      expect(surveyRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: SurveyStatus.ARCHIVED,
          archivedAt: expect.any(Date),
        }),
      );
      expect(auditService.log).toHaveBeenCalled();
    });
  });

  describe('deletePersonalData', () => {
    const adminUserId = 'admin-1';
    const ipAddress = '127.0.0.1';
    const respondentId = 'respondent-1';

    it('should throw ForbiddenException if approval is not from super admin', async () => {
      userRepository.findOne.mockResolvedValueOnce({
        id: 'not-super-admin',
        role: UserRole.ADMIN,
      });

      await expect(
        service.deletePersonalData(respondentId, 'not-super-admin', adminUserId, ipAddress),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if respondent does not exist', async () => {
      userRepository.findOne
        .mockResolvedValueOnce({ id: 'super-admin', role: UserRole.SUPER_ADMIN })
        .mockResolvedValueOnce(null);

      await expect(
        service.deletePersonalData(respondentId, 'super-admin', adminUserId, ipAddress),
      ).rejects.toThrow(NotFoundException);
    });

    it('should anonymize user data and delete profile and geolocation', async () => {
      const superAdmin = { id: 'super-admin', role: UserRole.SUPER_ADMIN };
      const respondent = {
        id: respondentId,
        fullName: 'John Doe',
        email: 'john@example.com',
        phone: '1234567890',
      };

      userRepository.findOne
        .mockResolvedValueOnce(superAdmin)
        .mockResolvedValueOnce(respondent);
      userRepository.save.mockResolvedValueOnce(respondent);

      await service.deletePersonalData(respondentId, 'super-admin', adminUserId, ipAddress);

      expect(userRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          fullName: '[DELETED]',
          email: `deleted_${respondentId}@anonymized.local`,
          phone: '0000000000',
        }),
      );
      expect(userProfileRepository.delete).toHaveBeenCalledWith({ userId: respondentId });
      expect(geolocationRepository.delete).toHaveBeenCalledWith({ userId: respondentId });
      expect(auditService.log).toHaveBeenCalled();
    });
  });

  describe('configureScheduledPurge', () => {
    it('should create new config when none exists', async () => {
      purgeConfigRepository.findOne.mockResolvedValueOnce(null);

      const config = {
        retentionDays: 90,
        enabled: true,
        cronExpression: '0 3 * * *',
      };

      await service.configureScheduledPurge(config);

      expect(purgeConfigRepository.create).toHaveBeenCalled();
      expect(purgeConfigRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          retentionDays: 90,
          enabled: true,
          cronExpression: '0 3 * * *',
        }),
      );
    });

    it('should update existing config', async () => {
      const existingConfig = {
        id: 'config-1',
        retentionDays: 365,
        enabled: false,
        cronExpression: '0 2 * * *',
      };
      purgeConfigRepository.findOne.mockResolvedValueOnce(existingConfig);

      const config = {
        retentionDays: 60,
        enabled: true,
        cronExpression: '0 4 * * *',
      };

      await service.configureScheduledPurge(config);

      expect(purgeConfigRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'config-1',
          retentionDays: 60,
          enabled: true,
          cronExpression: '0 4 * * *',
        }),
      );
    });
  });

  describe('executeScheduledPurge', () => {
    it('should return 0 if purge is not configured', async () => {
      purgeConfigRepository.findOne.mockResolvedValueOnce(null);

      const result = await service.executeScheduledPurge();

      expect(result.deletedCount).toBe(0);
    });

    it('should delete old exported responses when enabled', async () => {
      const config = {
        id: 'config-1',
        retentionDays: 90,
        enabled: true,
        cronExpression: '0 2 * * *',
        lastRunAt: null,
      };
      purgeConfigRepository.findOne.mockResolvedValueOnce(config);
      purgeConfigRepository.save.mockResolvedValueOnce(config);
      mockQueryBuilder.execute.mockResolvedValueOnce({ affected: 5 });

      const result = await service.executeScheduledPurge();

      expect(result.deletedCount).toBe(5);
      expect(auditService.log).toHaveBeenCalled();
      expect(purgeConfigRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ lastRunAt: expect.any(Date) }),
      );
    });
  });

  describe('getCleanupCandidates', () => {
    it('should return cleanup candidates grouped by survey', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValueOnce([
        {
          surveyId: 'survey-1',
          surveyTitle: 'Test Survey',
          responseCount: '10',
          oldestResponseDate: '2024-01-01',
          newestResponseDate: '2024-06-01',
        },
      ]);

      const result = await service.getCleanupCandidates({});

      expect(result).toHaveLength(1);
      expect(result[0].surveyId).toBe('survey-1');
      expect(result[0].responseCount).toBe(10);
    });
  });
});
