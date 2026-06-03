import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserStatus } from '@modules/auth/entities/user.entity';
import { UserRole, AuditActionType } from '@shared/enums';
import { AuditService } from '@modules/audit/audit.service';
import { CreateUserDto, ListUsersFilterDto } from './dto';
import {
  BulkImportResult,
  BulkImportError,
  PaginatedUsers,
  ActivityEntry,
} from './interfaces';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class UserManagerService {
  private readonly logger = new Logger(UserManagerService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Generate a random temporary password.
   */
  private generateRandomPassword(length = 12): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  /**
   * Create a new user with a generated temporary password.
   */
  async createUser(
    dto: CreateUserDto,
    adminUserId: string,
    ipAddress: string,
  ): Promise<{ user: User; temporaryPassword: string }> {
    // Check for duplicate email
    const existingByEmail = await this.userRepository.findOne({
      where: { email: dto.email },
    });
    if (existingByEmail) {
      throw new ConflictException(`User with email ${dto.email} already exists`);
    }

    // Check for duplicate phone
    const existingByPhone = await this.userRepository.findOne({
      where: { phone: dto.phone },
    });
    if (existingByPhone) {
      throw new ConflictException(`User with phone ${dto.phone} already exists`);
    }

    const temporaryPassword = this.generateRandomPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);

    const user = this.userRepository.create({
      fullName: dto.fullName,
      email: dto.email,
      phone: dto.phone,
      role: dto.role,
      passwordHash,
      status: UserStatus.ACTIVE,
      emailVerified: false,
      profileCompleted: false,
    });

    const savedUser = await this.userRepository.save(user);

    await this.auditService.log({
      userId: adminUserId,
      actionType: AuditActionType.USER_CREATE,
      module: 'user-manager',
      details: { createdUserId: savedUser.id, email: dto.email, role: dto.role },
      ipAddress,
    });

    return { user: savedUser, temporaryPassword };
  }

  /**
   * Update a user's role.
   */
  async updateUserRole(
    userId: string,
    newRole: UserRole,
    adminUserId: string,
    ipAddress: string,
  ): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with id ${userId} not found`);
    }

    const oldRole = user.role;
    user.role = newRole;
    await this.userRepository.save(user);

    await this.auditService.log({
      userId: adminUserId,
      actionType: AuditActionType.ROLE_CHANGE,
      module: 'user-manager',
      details: { targetUserId: userId, oldRole, newRole },
      ipAddress,
    });
  }

  /**
   * Activate a user account.
   */
  async activateUser(
    userId: string,
    adminUserId: string,
    ipAddress: string,
  ): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with id ${userId} not found`);
    }

    user.status = UserStatus.ACTIVE;
    await this.userRepository.save(user);

    await this.auditService.log({
      userId: adminUserId,
      actionType: AuditActionType.USER_ACTIVATE,
      module: 'user-manager',
      details: { targetUserId: userId },
      ipAddress,
    });
  }

  /**
   * Deactivate a user account.
   */
  async deactivateUser(
    userId: string,
    adminUserId: string,
    ipAddress: string,
  ): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with id ${userId} not found`);
    }

    user.status = UserStatus.INACTIVE;
    await this.userRepository.save(user);

    await this.auditService.log({
      userId: adminUserId,
      actionType: AuditActionType.USER_DEACTIVATE,
      module: 'user-manager',
      details: { targetUserId: userId },
      ipAddress,
    });
  }

  /**
   * Reset a user's password and return the new temporary password.
   */
  async resetUserPassword(
    userId: string,
    adminUserId: string,
    ipAddress: string,
  ): Promise<{ temporaryPassword: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with id ${userId} not found`);
    }

    const temporaryPassword = this.generateRandomPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);

    user.passwordHash = passwordHash;
    await this.userRepository.save(user);

    await this.auditService.log({
      userId: adminUserId,
      actionType: AuditActionType.USER_PASSWORD_RESET,
      module: 'user-manager',
      details: { targetUserId: userId },
      ipAddress,
    });

    return { temporaryPassword };
  }

  /**
   * List users with filters and pagination.
   */
  async listUsers(filters: ListUsersFilterDto): Promise<PaginatedUsers> {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .orderBy('user.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (filters.role) {
      queryBuilder.andWhere('user.role = :role', { role: filters.role });
    }

    if (filters.status) {
      queryBuilder.andWhere('user.status = :status', { status: filters.status });
    }

    if (filters.search) {
      queryBuilder.andWhere(
        '(user.full_name ILIKE :search OR user.email ILIKE :search)',
        { search: `%${filters.search}%` },
      );
    }

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get user activity history from audit logs.
   */
  async getUserActivityHistory(userId: string): Promise<ActivityEntry[]> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with id ${userId} not found`);
    }

    const result = await this.auditService.query(
      { userId },
      { page: 1, limit: 100 },
    );

    return result.data.map((entry: any) => ({
      id: entry.id,
      actionType: entry.actionType,
      module: entry.module,
      details: entry.details || {},
      ipAddress: entry.ipAddress,
      createdAt: entry.createdAt,
    }));
  }

  /**
   * Bulk import users from CSV content.
   * CSV format: fullName,email,phone,role
   */
  async bulkImportUsers(
    csvContent: string,
    adminUserId: string,
    ipAddress: string,
  ): Promise<BulkImportResult> {
    const lines = csvContent
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      throw new BadRequestException('CSV file is empty');
    }

    // Check if first line is a header (must start with typical header keywords)
    const firstLineCols = lines[0].split(',').map((col) => col.trim().toLowerCase());
    const headerKeywords = ['name', 'fullname', 'full_name', 'email', 'phone', 'role'];
    const hasHeader = firstLineCols.length >= 4 &&
      firstLineCols.filter((col) => headerKeywords.includes(col)).length >= 3;

    const dataLines = hasHeader ? lines.slice(1) : lines;

    const errors: BulkImportError[] = [];
    let successCount = 0;

    const validRoles = Object.values(UserRole);

    for (let i = 0; i < dataLines.length; i++) {
      const rowNumber = hasHeader ? i + 2 : i + 1;
      const line = dataLines[i];
      const columns = line.split(',').map((col) => col.trim());

      if (columns.length < 4) {
        errors.push({
          row: rowNumber,
          reason: 'Invalid format: expected 4 columns (fullName, email, phone, role)',
        });
        continue;
      }

      const [fullName, email, phone, roleStr] = columns;

      // Validate fullName
      if (!fullName || fullName.length < 2) {
        errors.push({
          row: rowNumber,
          email,
          reason: 'Invalid name: must be at least 2 characters',
        });
        continue;
      }

      // Validate email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email || !emailRegex.test(email)) {
        errors.push({
          row: rowNumber,
          email,
          reason: 'Invalid email format',
        });
        continue;
      }

      // Validate phone
      if (!phone || phone.length < 5) {
        errors.push({
          row: rowNumber,
          email,
          reason: 'Invalid phone: must be at least 5 characters',
        });
        continue;
      }

      // Validate role
      const role = roleStr.toLowerCase() as UserRole;
      if (!validRoles.includes(role)) {
        errors.push({
          row: rowNumber,
          email,
          reason: `Invalid role: ${roleStr}. Must be one of: ${validRoles.join(', ')}`,
        });
        continue;
      }

      // Check for duplicate email
      const existingByEmail = await this.userRepository.findOne({
        where: { email },
      });
      if (existingByEmail) {
        errors.push({
          row: rowNumber,
          email,
          reason: `Duplicate: user with email ${email} already exists`,
        });
        continue;
      }

      // Check for duplicate phone
      const existingByPhone = await this.userRepository.findOne({
        where: { phone },
      });
      if (existingByPhone) {
        errors.push({
          row: rowNumber,
          email,
          reason: `Duplicate: user with phone ${phone} already exists`,
        });
        continue;
      }

      try {
        const temporaryPassword = this.generateRandomPassword();
        const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);

        const user = this.userRepository.create({
          fullName,
          email,
          phone,
          role,
          passwordHash,
          status: UserStatus.ACTIVE,
          emailVerified: false,
          profileCompleted: false,
        });

        await this.userRepository.save(user);
        successCount++;
      } catch (error: any) {
        errors.push({
          row: rowNumber,
          email,
          reason: `Database error: ${error.message || 'Unknown error'}`,
        });
      }
    }

    await this.auditService.log({
      userId: adminUserId,
      actionType: AuditActionType.USER_BULK_IMPORT,
      module: 'user-manager',
      details: { successCount, failedCount: errors.length, totalRows: dataLines.length },
      ipAddress,
    });

    return {
      successCount,
      failedCount: errors.length,
      errors,
    };
  }
}
