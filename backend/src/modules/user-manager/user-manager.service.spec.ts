import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { UserManagerService } from './user-manager.service';
import { User, UserStatus } from '@modules/auth/entities/user.entity';
import { AuditService } from '@modules/audit/audit.service';
import { SessionRevocationService } from '@modules/auth/session-revocation.service';
import { UserRole, AuditActionType } from '@shared/enums';

describe('UserManagerService', () => {
  let service: UserManagerService;
  let userRepository: any;
  let auditService: any;
  let dataSource: any;
  let sessionRevocation: any;

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

    dataSource = {
      query: vi.fn().mockResolvedValue([]),
      transaction: vi.fn(async (cb: any) => cb({ query: vi.fn().mockResolvedValue(undefined) })),
    };

    sessionRevocation = {
      revokeAllSessions: vi.fn().mockResolvedValue(undefined),
      clearAuthState: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserManagerService,
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: AuditService, useValue: auditService },
        { provide: DataSource, useValue: dataSource },
        { provide: SessionRevocationService, useValue: sessionRevocation },
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

      await expect(service.activateUser('nonexistent', 'admin-1', '127.0.0.1')).rejects.toThrow(
        NotFoundException,
      );
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

      await expect(service.deactivateUser('nonexistent', 'admin-1', '127.0.0.1')).rejects.toThrow(
        NotFoundException,
      );
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

    it('should always exclude respondents (kelola di halaman Responden)', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.listUsers({});

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('user.role != :respondentRole', {
        respondentRole: UserRole.RESPONDENT,
      });
    });

    it('should apply role filter', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.listUsers({ role: UserRole.ADMIN });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('user.role = :role', {
        role: UserRole.ADMIN,
      });
    });

    it('should apply status filter', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.listUsers({ status: UserStatus.ACTIVE });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('user.status = :status', {
        status: UserStatus.ACTIVE,
      });
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

      await expect(service.getUserActivityHistory('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('bulkImportUsers', () => {
    it('should import valid CSV rows successfully', async () => {
      userRepository.findOne.mockResolvedValue(null);

      const csv = `fullName,email,phone,role
John Doe,john@example.com,+6281234567890,admin
Jane Smith,jane@example.com,+6281234567891,analyst`;

      const result = await service.bulkImportUsers(
        csv,
        'admin-1',
        '127.0.0.1',
        UserRole.SUPER_ADMIN,
      );

      expect(result.successCount).toBe(2);
      expect(result.failedCount).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(userRepository.save).toHaveBeenCalledTimes(2);
    });

    it('should handle rows with invalid email', async () => {
      userRepository.findOne.mockResolvedValue(null);

      const csv = `John Doe,invalid-email,+6281234567890,admin`;

      const result = await service.bulkImportUsers(
        csv,
        'admin-1',
        '127.0.0.1',
        UserRole.SUPER_ADMIN,
      );

      expect(result.successCount).toBe(0);
      expect(result.failedCount).toBe(1);
      expect(result.errors[0].reason).toContain('Invalid email');
    });

    it('should handle rows with invalid role', async () => {
      userRepository.findOne.mockResolvedValue(null);

      const csv = `John Doe,john@example.com,+6281234567890,invalid_role`;

      const result = await service.bulkImportUsers(
        csv,
        'admin-1',
        '127.0.0.1',
        UserRole.SUPER_ADMIN,
      );

      expect(result.successCount).toBe(0);
      expect(result.failedCount).toBe(1);
      expect(result.errors[0].reason).toContain('Invalid role');
    });

    it('should handle duplicate emails gracefully', async () => {
      userRepository.findOne.mockResolvedValueOnce({ id: 'existing', email: 'john@example.com' }); // email exists

      const csv = `John Doe,john@example.com,+6281234567890,admin`;

      const result = await service.bulkImportUsers(
        csv,
        'admin-1',
        '127.0.0.1',
        UserRole.SUPER_ADMIN,
      );

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

      const result = await service.bulkImportUsers(
        csv,
        'admin-1',
        '127.0.0.1',
        UserRole.SUPER_ADMIN,
      );

      expect(result.successCount).toBe(2);
      expect(result.failedCount).toBe(1);
    });

    it('should throw BadRequestException for empty CSV', async () => {
      await expect(
        service.bulkImportUsers('', 'admin-1', '127.0.0.1', UserRole.SUPER_ADMIN),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle rows with insufficient columns', async () => {
      userRepository.findOne.mockResolvedValue(null);

      const csv = `John Doe,john@example.com`;

      const result = await service.bulkImportUsers(
        csv,
        'admin-1',
        '127.0.0.1',
        UserRole.SUPER_ADMIN,
      );

      expect(result.failedCount).toBe(1);
      expect(result.errors[0].reason).toContain('Invalid format');
    });

    it('should log bulk import to audit', async () => {
      userRepository.findOne.mockResolvedValue(null);

      const csv = `John Doe,john@example.com,+6281234567890,admin`;

      await service.bulkImportUsers(csv, 'admin-1', '127.0.0.1', UserRole.SUPER_ADMIN);

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: AuditActionType.USER_BULK_IMPORT,
          module: 'user-manager',
        }),
      );
    });
  });

  describe('deleteUser', () => {
    const requesterAdmin = { userId: 'admin-1', role: UserRole.ADMIN };

    it('should reject deleting your own account', async () => {
      await expect(service.deleteUser('admin-1', requesterAdmin, '127.0.0.1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should 404 when target not found', async () => {
      userRepository.findOne.mockResolvedValue(null);
      await expect(service.deleteUser('ghost', requesterAdmin, '127.0.0.1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should forbid admin from deleting a super admin', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 'sa',
        role: UserRole.SUPER_ADMIN,
        email: 'sa@x.com',
      });
      await expect(service.deleteUser('sa', requesterAdmin, '127.0.0.1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should reject deleting an account that created surveys', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 'u2',
        role: UserRole.RESPONDENT,
        email: 'u2@x.com',
      });
      dataSource.query.mockResolvedValueOnce([{ '?column?': 1 }]); // owns a survey
      await expect(service.deleteUser('u2', requesterAdmin, '127.0.0.1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should delete a respondent in a transaction and audit it', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 'r1',
        role: UserRole.RESPONDENT,
        email: 'r1@x.com',
      });
      dataSource.query.mockResolvedValueOnce([]); // no surveys

      await service.deleteUser('r1', requesterAdmin, '127.0.0.1');

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: AuditActionType.USER_DELETE }),
      );
    });
  });

  // ── Audit keamanan 23 Nov 2026 ──────────────────────────────────────────
  describe('audit T-03: impor CSV oleh ADMIN hanya boleh membuat responden', () => {
    it.each(['super_admin', 'admin', 'analyst', 'viewer', 'surveyor'])(
      'ADMIN tidak bisa mengimpor peran %s',
      async (role) => {
        userRepository.findOne.mockResolvedValue(null);
        const csv = `Orang Dalam,me@example.com,+6281234567890,${role}`;

        const result = await service.bulkImportUsers(csv, 'admin-1', '127.0.0.1', UserRole.ADMIN);

        expect(result.successCount).toBe(0);
        expect(result.errors[0].reason).toContain('Invalid role');
        expect(userRepository.save).not.toHaveBeenCalled();
      },
    );

    it('ADMIN boleh mengimpor responden', async () => {
      userRepository.findOne.mockResolvedValue(null);
      const csv = `Budi,budi@example.com,+6281234567890,respondent`;

      const result = await service.bulkImportUsers(csv, 'admin-1', '127.0.0.1', UserRole.ADMIN);

      expect(result.successCount).toBe(1);
      expect(userRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: UserRole.RESPONDENT }),
      );
    });

    it('SUPER_ADMIN tetap boleh mengimpor peran staf', async () => {
      userRepository.findOne.mockResolvedValue(null);
      const csv = `Staf,staf@example.com,+6281234567890,admin`;

      const result = await service.bulkImportUsers(csv, 'sa-1', '127.0.0.1', UserRole.SUPER_ADMIN);

      expect(result.successCount).toBe(1);
    });

    it('email impor dinormalisasi huruf kecil & peran dicatat di audit log', async () => {
      userRepository.findOne.mockResolvedValue(null);
      const csv = `Budi,Budi@Example.COM,+6281234567890,respondent`;

      await service.bulkImportUsers(csv, 'admin-1', '127.0.0.1', UserRole.ADMIN);

      expect(userRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'budi@example.com' }),
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({
            requesterRole: UserRole.ADMIN,
            importedRoles: { respondent: 1 },
          }),
        }),
      );
    });
  });

  describe('audit T-12: createUser tidak mengembalikan hash sandi', () => {
    it('respons createUser tanpa passwordHash', async () => {
      userRepository.findOne.mockResolvedValue(null);

      const result = await service.createUser(
        { fullName: 'A', email: 'a@example.com', phone: '+628111', role: UserRole.ANALYST },
        'sa-1',
        '127.0.0.1',
      );

      expect(result.user).not.toHaveProperty('passwordHash');
      expect(JSON.stringify(result)).not.toMatch(/\$2[aby]\$/);
    });
  });

  describe('audit T-11: pencabutan sesi', () => {
    const target = () => ({
      id: 'u-1',
      email: 'u@example.com',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    });

    it('deactivate mencabut semua sesi', async () => {
      userRepository.findOne.mockResolvedValue(target());
      await service.deactivateUser('u-1', 'sa-1', '127.0.0.1');
      expect(sessionRevocation.revokeAllSessions).toHaveBeenCalledWith('u-1');
    });

    it('reset sandi oleh admin mencabut semua sesi & sandi sementara memakai CSPRNG', async () => {
      userRepository.findOne.mockResolvedValue(target());
      const mathRandom = vi.spyOn(Math, 'random');
      const { temporaryPassword } = await service.resetUserPassword('u-1', 'sa-1', '127.0.0.1');
      expect(temporaryPassword).toHaveLength(12);
      expect(mathRandom).not.toHaveBeenCalled();
      expect(sessionRevocation.revokeAllSessions).toHaveBeenCalledWith('u-1');
      mathRandom.mockRestore();
    });

    it('ganti peran mencabut semua sesi', async () => {
      userRepository.findOne.mockResolvedValue(target());
      await service.updateUserRole('u-1', UserRole.VIEWER, 'sa-1', '127.0.0.1');
      expect(sessionRevocation.revokeAllSessions).toHaveBeenCalledWith('u-1');
    });

    it('peran sama → tidak perlu mencabut sesi', async () => {
      userRepository.findOne.mockResolvedValue(target());
      await service.updateUserRole('u-1', UserRole.ADMIN, 'sa-1', '127.0.0.1');
      expect(sessionRevocation.revokeAllSessions).not.toHaveBeenCalled();
    });

    it('updateUser dengan sandi baru mencabut sesi; tanpa sandi tidak', async () => {
      userRepository.findOne.mockResolvedValue(target());
      await service.updateUser('u-1', { fullName: 'Nama' }, 'sa-1', '127.0.0.1');
      expect(sessionRevocation.revokeAllSessions).not.toHaveBeenCalled();

      userRepository.findOne.mockResolvedValue(target());
      await service.updateUser('u-1', { password: 'BaruSekali123' }, 'sa-1', '127.0.0.1');
      expect(sessionRevocation.revokeAllSessions).toHaveBeenCalledWith('u-1');
    });

    it('activate membuang cache keadaan otorisasi', async () => {
      userRepository.findOne.mockResolvedValue({ ...target(), status: UserStatus.INACTIVE });
      await service.activateUser('u-1', 'sa-1', '127.0.0.1');
      expect(sessionRevocation.clearAuthState).toHaveBeenCalledWith('u-1');
    });

    it('hapus akun (admin & mandiri) membuang cache keadaan otorisasi', async () => {
      userRepository.findOne.mockResolvedValue({ ...target(), role: UserRole.RESPONDENT });
      await service.deleteUser('u-1', { userId: 'sa-1', role: UserRole.SUPER_ADMIN }, '127.0.0.1');
      expect(sessionRevocation.clearAuthState).toHaveBeenCalledWith('u-1');

      sessionRevocation.clearAuthState.mockClear();
      userRepository.findOne.mockResolvedValue({ ...target(), id: 'me' });
      await service.deleteOwnAccount('me', '127.0.0.1');
      expect(sessionRevocation.clearAuthState).toHaveBeenCalledWith('me');
    });
  });
});
