import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { UserManagerService } from './user-manager.service';
import { User, UserStatus } from '@modules/auth/entities/user.entity';
import { AuditService } from '@modules/audit/audit.service';
import { UserRole, AuditActionType } from '@shared/enums';

describe('UserManagerService', () => {
  let service: UserManagerService;
  let userRepository: any;
  let auditService: any;

  beforeEach(async () => {
    userRepository = {
      findOne: vi.fn(),
      create: vi.fn((data: any) => ({ id: 'new-user-id', ...data })),
      save: vi.fn((entity: any) => Promise.resolve(entity)),
      createQueryBuilder: vi.fn(),
    };

    auditService = {
      log: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserManagerService,
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<UserManagerService>(UserManagerService);
  });

  describe('createUser', () => {
    it('should create a user with a temporary password', async () => {
      userRepository.findOne.mockResolvedValue(null);

      const dto = {
        fullName: 'John Doe',
        email: 'john@example.com',
        phone: '+6281234567890',
        role: UserRole.ANALYST,
      };

      const result = await service.createUser(dto, 'admin-1', '127.0.0.1');

      expect(result.user).toBeDefined();
      expect(result.temporaryPassword).toBeDefined();
      expect(result.temporaryPassword.length).toBeGreaterThanOrEqual(12);
      expect(userRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          fullName: 'John Doe',
          email: 'john@example.com',
          phone: '+6281234567890',
          role: UserRole.ANALYST,
          status: UserStatus.ACTIVE,
        }),
      );
      expect(userRepository.save).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: AuditActionType.USER_CREATE,
          module: 'user-manager',
        }),
      );
    });

    it('should throw ConflictException if email already exists', async () => {
      userRepository.findOne.mockResolvedValueOnce({ id: 'existing', email: 'john@example.com' });

      const dto = {
        fullName: 'John Doe',
        email: 'john@example.com',
        phone: '+6281234567890',
        role: UserRole.ANALYST,
      };

      await expect(service.createUser(dto, 'admin-1', '127.0.0.1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException if phone already exists', async () => {
      userRepository.findOne
        .mockResolvedValueOnce(null) // email check
        .mockResolvedValueOnce({ id: 'existing', phone: '+6281234567890' }); // phone check

      const dto = {
        fullName: 'John Doe',
        email: 'john@example.com',
        phone: '+6281234567890',
        role: UserRole.ANALYST,
      };

      await expect(service.createUser(dto, 'admin-1', '127.0.0.1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('updateUserRole', () => {
    it('should update user role and log audit event', async () => {
      const user = { id: 'user-1', role: UserRole.VIEWER, status: UserStatus.ACTIVE };
      userRepository.findOne.mockResolvedValue(user);

      await service.updateUserRole('user-1', UserRole.ADMIN, 'admin-1', '127.0.0.1');

      expect(userRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ role: UserRole.ADMIN }),
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: AuditActionType.ROLE_CHANGE,
          details: expect.objectContaining({
            oldRole: UserRole.VIEWER,
            newRole: UserRole.ADMIN,
          }),
        }),
      );
    });

    it('should throw NotFoundException if user does not exist', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateUserRole('nonexistent', UserRole.ADMIN, 'admin-1', '127.0.0.1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('activateUser', () => {
    it('should set user status to active', async () => {
      const user = { id: 'user-1', status: UserStatus.INACTIVE };
      userRepository.findOne.mockResolvedValue(user);

      await service.activateUser('user-1', 'admin-1', '127.0.0.1');

      expect(userRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: UserStatus.ACTIVE }),
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: AuditActionType.USER_ACTIVATE,
        }),
      );
    });

    it('should throw NotFoundException if user does not exist', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        service.activateUser('nonexistent', 'admin-1', '127.0.0.1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deactivateUser', () => {
    it('should set user status to inactive', async () => {
      const user = { id: 'user-1', status: UserStatus.ACTIVE };
      userRepository.findOne.mockResolvedValue(user);

      await service.deactivateUser('user-1', 'admin-1', '127.0.0.1');

      expect(userRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: UserStatus.INACTIVE }),
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: AuditActionType.USER_DEACTIVATE,
        }),
      );
    });

    it('should throw NotFoundException if user does not exist', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        service.deactivateUser('nonexistent', 'admin-1', '127.0.0.1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('resetUserPassword', () => {
    it('should generate a new password and update the user', async () => {
      const user = { id: 'user-1', passwordHash: 'old-hash' };
      userRepository.findOne.mockResolvedValue(user);

      const result = await service.resetUserPassword('user-1', 'admin-1', '127.0.0.1');

      expect(result.temporaryPassword).toBeDefined();
      expect(result.temporaryPassword.length).toBeGreaterThanOrEqual(12);
      expect(userRepository.save).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: AuditActionType.USER_PASSWORD_RESET,
        }),
      );
    });

    it('should throw NotFoundException if user does not exist', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        service.resetUserPassword('nonexistent', 'admin-1', '127.0.0.1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listUsers', () => {
    let mockQueryBuilder: any;

    beforeEach(() => {
      mockQueryBuilder = {
        orderBy: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        getManyAndCount: vi.fn().mockResolvedValue([[], 0]),
      };
      userRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
    });

    it('should return paginated users with default pagination', async () => {
      const mockUsers = [{ id: 'user-1', fullName: 'John' }];
      mockQueryBuilder.getManyAndCount.mockResolvedValue([mockUsers, 1]);

      const result = await service.listUsers({});

      expect(result).toEqual({
        data: mockUsers,
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('should apply role filter', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.listUsers({ role: UserRole.ADMIN });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'user.role = :role',
        { role: UserRole.ADMIN },
      );
    });

    it('should apply status filter', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.listUsers({ status: UserStatus.ACTIVE });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'user.status = :status',
        { status: UserStatus.ACTIVE },
      );
    });

    it('should apply search filter', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.listUsers({ search: 'john' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(user.full_name ILIKE :search OR user.email ILIKE :search)',
        { search: '%john%' },
      );
    });

    it('should handle custom pagination', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 50]);

      const result = await service.listUsers({ page: 3, limit: 10 });

      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(20);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
      expect(result.page).toBe(3);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(5);
    });
  });

  describe('getUserActivityHistory', () => {
    it('should return activity entries for a user', async () => {
      const user = { id: 'user-1', fullName: 'John' };
      userRepository.findOne.mockResolvedValue(user);

      const mockAuditData = [
        {
          id: 'audit-1',
          actionType: AuditActionType.LOGIN,
          module: 'auth',
          details: {},
          ipAddress: '127.0.0.1',
          createdAt: new Date('2025-01-01'),
        },
      ];
      auditService.query.mockResolvedValue({
        data: mockAuditData,
        total: 1,
        page: 1,
        limit: 100,
        totalPages: 1,
      });

      const result = await service.getUserActivityHistory('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].actionType).toBe(AuditActionType.LOGIN);
      expect(auditService.query).toHaveBeenCalledWith(
        { userId: 'user-1' },
        { page: 1, limit: 100 },
      );
    });

    it('should throw NotFoundException if user does not exist', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getUserActivityHistory('nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('bulkImportUsers', () => {
    it('should import valid CSV rows successfully', async () => {
      userRepository.findOne.mockResolvedValue(null);

      const csv = `fullName,email,phone,role
John Doe,john@example.com,+6281234567890,admin
Jane Smith,jane@example.com,+6281234567891,analyst`;

      const result = await service.bulkImportUsers(csv, 'admin-1', '127.0.0.1');

      expect(result.successCount).toBe(2);
      expect(result.failedCount).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(userRepository.save).toHaveBeenCalledTimes(2);
    });

    it('should handle rows with invalid email', async () => {
      userRepository.findOne.mockResolvedValue(null);

      const csv = `John Doe,invalid-email,+6281234567890,admin`;

      const result = await service.bulkImportUsers(csv, 'admin-1', '127.0.0.1');

      expect(result.successCount).toBe(0);
      expect(result.failedCount).toBe(1);
      expect(result.errors[0].reason).toContain('Invalid email');
    });

    it('should handle rows with invalid role', async () => {
      userRepository.findOne.mockResolvedValue(null);

      const csv = `John Doe,john@example.com,+6281234567890,invalid_role`;

      const result = await service.bulkImportUsers(csv, 'admin-1', '127.0.0.1');

      expect(result.successCount).toBe(0);
      expect(result.failedCount).toBe(1);
      expect(result.errors[0].reason).toContain('Invalid role');
    });

    it('should handle duplicate emails gracefully', async () => {
      userRepository.findOne
        .mockResolvedValueOnce({ id: 'existing', email: 'john@example.com' }); // email exists

      const csv = `John Doe,john@example.com,+6281234567890,admin`;

      const result = await service.bulkImportUsers(csv, 'admin-1', '127.0.0.1');

      expect(result.successCount).toBe(0);
      expect(result.failedCount).toBe(1);
      expect(result.errors[0].reason).toContain('Duplicate');
    });

    it('should handle partial success (some rows valid, some invalid)', async () => {
      userRepository.findOne.mockResolvedValue(null);

      const csv = `fullName,email,phone,role
John Doe,john@example.com,+6281234567890,admin
,invalid,123,bad_role
Jane Smith,jane@example.com,+6281234567891,viewer`;

      const result = await service.bulkImportUsers(csv, 'admin-1', '127.0.0.1');

      expect(result.successCount).toBe(2);
      expect(result.failedCount).toBe(1);
    });

    it('should throw BadRequestException for empty CSV', async () => {
      await expect(
        service.bulkImportUsers('', 'admin-1', '127.0.0.1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle rows with insufficient columns', async () => {
      userRepository.findOne.mockResolvedValue(null);

      const csv = `John Doe,john@example.com`;

      const result = await service.bulkImportUsers(csv, 'admin-1', '127.0.0.1');

      expect(result.failedCount).toBe(1);
      expect(result.errors[0].reason).toContain('Invalid format');
    });

    it('should log bulk import to audit', async () => {
      userRepository.findOne.mockResolvedValue(null);

      const csv = `John Doe,john@example.com,+6281234567890,admin`;

      await service.bulkImportUsers(csv, 'admin-1', '127.0.0.1');

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: AuditActionType.USER_BULK_IMPORT,
          module: 'user-manager',
        }),
      );
    });
  });
});
