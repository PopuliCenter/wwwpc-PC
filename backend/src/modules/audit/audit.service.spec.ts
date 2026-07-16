import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from './audit.service';
import { CronLockService } from '../../common/scheduling/cron-lock.service';
import { AuditLog } from './entities/audit-log.entity';
import { User } from '@modules/auth/entities/user.entity';
import { AuditActionType } from '@shared/enums';

describe('AuditService', () => {
  let service: AuditService;
  let repository: any;
  let mockUserRepository: any;

  beforeEach(async () => {
    repository = {
      create: vi.fn((data: any) => ({ id: 'audit-1', ...data })),
      save: vi.fn((entity: any) => Promise.resolve(entity)),
      delete: vi.fn().mockResolvedValue({ affected: 0 }),
      createQueryBuilder: vi.fn(),
    };
    mockUserRepository = { find: vi.fn().mockResolvedValue([]), findOne: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: CronLockService, useValue: { acquire: async () => true } },
        { provide: getRepositoryToken(AuditLog), useValue: repository },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  describe('log', () => {
    it('should create and save an audit log entry with all required fields', async () => {
      const event = {
        userId: 'user-123',
        actionType: AuditActionType.LOGIN,
        module: 'auth',
        details: { browser: 'Chrome' },
        ipAddress: '192.168.1.1',
        timestamp: new Date('2025-01-15T10:00:00Z'),
      };

      await service.log(event);

      expect(repository.create).toHaveBeenCalledWith({
        userId: 'user-123',
        actionType: AuditActionType.LOGIN,
        module: 'auth',
        details: { browser: 'Chrome' },
        ipAddress: '192.168.1.1',
        createdAt: new Date('2025-01-15T10:00:00Z'),
      });
      expect(repository.save).toHaveBeenCalled();
    });

    it('should use current timestamp when not provided', async () => {
      const event = {
        userId: 'user-456',
        actionType: AuditActionType.SURVEY_CREATE,
        module: 'survey',
        ipAddress: '10.0.0.1',
      };

      await service.log(event);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-456',
          actionType: AuditActionType.SURVEY_CREATE,
          module: 'survey',
          ipAddress: '10.0.0.1',
          details: {},
          createdAt: expect.any(Date),
        }),
      );
    });

    it('should default details to empty object when not provided', async () => {
      const event = {
        userId: 'user-789',
        actionType: AuditActionType.LOGOUT,
        module: 'auth',
        ipAddress: '172.16.0.1',
      };

      await service.log(event);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          details: {},
        }),
      );
    });
  });

  describe('query', () => {
    let mockQueryBuilder: any;

    beforeEach(() => {
      mockQueryBuilder = {
        orderBy: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        getManyAndCount: vi.fn().mockResolvedValue([[], 0]),
      };
      repository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
    });

    it('should return paginated results with default pagination', async () => {
      const mockData = [{ id: 'audit-1', userId: 'user-1', actionType: AuditActionType.LOGIN }];
      mockQueryBuilder.getManyAndCount.mockResolvedValue([mockData, 1]);

      const result = await service.query({});

      // query() memperkaya tiap entri dengan actor (userName/userRole) & details.
      expect(result).toEqual({
        data: [
          {
            ...mockData[0],
            userName: null,
            userRole: null,
            userEmail: null,
            userExists: false,
            details: {},
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(20);
    });

    it('should apply userId filter with an exact UUID match', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);
      const uuid = '11111111-1111-1111-1111-111111111111';

      await service.query({ userId: uuid });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('audit.user_id = :userId', {
        userId: uuid,
      });
    });

    it('should treat a non-UUID userId as a name/email search', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);
      // Dua user cocok dengan nama "afifa" → filter IN id-id mereka.
      mockUserRepository.find.mockResolvedValueOnce([{ id: 'u-1' }, { id: 'u-2' }]);

      await service.query({ userId: 'afifa' });

      expect(mockUserRepository.find).toHaveBeenCalled();
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('audit.user_id IN (:...userIds)', {
        userIds: ['u-1', 'u-2'],
      });
    });

    it('should return no rows when a name search matches no user', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);
      mockUserRepository.find.mockResolvedValueOnce([]);

      await service.query({ userId: 'tidakada' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('1 = 0');
    });

    it('should apply actionType filter', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.query({ actionType: AuditActionType.SURVEY_CREATE });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('audit.action_type = :actionType', {
        actionType: AuditActionType.SURVEY_CREATE,
      });
    });

    it('should apply module filter', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.query({ module: 'survey' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('audit.module = :module', {
        module: 'survey',
      });
    });

    it('should apply ipAddress filter', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.query({ ipAddress: '192.168.1.1' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('audit.ip_address = :ipAddress', {
        ipAddress: '192.168.1.1',
      });
    });

    it('should apply date range filter', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.query({
        dateRange: { start: '2025-01-01', end: '2025-01-31' },
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('audit.created_at >= :startDate', {
        startDate: '2025-01-01',
      });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('audit.created_at <= :endDate', {
        endDate: '2025-01-31',
      });
    });

    it('should handle custom pagination', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 50]);

      const result = await service.query({}, { page: 3, limit: 10 });

      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(20);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
      expect(result.page).toBe(3);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(5);
    });

    it('should combine multiple filters', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.query({
        userId: 'user-1',
        actionType: AuditActionType.LOGIN,
        module: 'auth',
        ipAddress: '10.0.0.1',
        dateRange: { start: '2025-01-01', end: '2025-12-31' },
      });

      // userId + actionType + module + ipAddress + dateRange.start + dateRange.end = 6
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledTimes(6);
    });
  });

  describe('cleanupOldLogs', () => {
    it('should delete logs older than the specified retention period', async () => {
      repository.delete.mockResolvedValue({ affected: 15 });

      const result = await service.cleanupOldLogs(12);

      expect(result).toBe(15);
      expect(repository.delete).toHaveBeenCalledWith({
        createdAt: expect.any(Object),
      });
    });

    it('should enforce minimum 12 months retention', async () => {
      repository.delete.mockResolvedValue({ affected: 0 });

      await service.cleanupOldLogs(6);

      // Should still use 12 months as minimum
      expect(repository.delete).toHaveBeenCalled();
    });

    it('should use default 12 months when no argument provided', async () => {
      repository.delete.mockResolvedValue({ affected: 5 });

      const result = await service.cleanupOldLogs();

      expect(result).toBe(5);
      expect(repository.delete).toHaveBeenCalled();
    });

    it('should return 0 when no logs are deleted', async () => {
      repository.delete.mockResolvedValue({ affected: 0 });

      const result = await service.cleanupOldLogs(24);

      expect(result).toBe(0);
    });
  });
});
