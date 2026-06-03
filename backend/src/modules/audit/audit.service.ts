import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import {
  AuditEvent,
  AuditFilter,
  PaginationOptions,
  PaginatedAuditEntries,
} from './interfaces';

const DEFAULT_RETENTION_MONTHS = 12;

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  /**
   * Log an audit event with all required fields.
   */
  async log(event: AuditEvent): Promise<void> {
    const entry = this.auditLogRepository.create({
      userId: event.userId,
      actionType: event.actionType,
      module: event.module,
      details: event.details || {},
      ipAddress: event.ipAddress,
      createdAt: event.timestamp || new Date(),
    });

    await this.auditLogRepository.save(entry);
    this.logger.debug(
      `Audit log: ${event.actionType} by ${event.userId} in ${event.module}`,
    );
  }

  /**
   * Query audit logs with filters and pagination.
   */
  async query(
    filters: AuditFilter,
    pagination: PaginationOptions = {},
  ): Promise<PaginatedAuditEntries> {
    const page = pagination.page || 1;
    const limit = pagination.limit || 20;
    const skip = (page - 1) * limit;

    const queryBuilder = this.auditLogRepository
      .createQueryBuilder('audit')
      .orderBy('audit.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (filters.userId) {
      queryBuilder.andWhere('audit.user_id = :userId', {
        userId: filters.userId,
      });
    }

    if (filters.actionType) {
      queryBuilder.andWhere('audit.action_type = :actionType', {
        actionType: filters.actionType,
      });
    }

    if (filters.module) {
      queryBuilder.andWhere('audit.module = :module', {
        module: filters.module,
      });
    }

    if (filters.ipAddress) {
      queryBuilder.andWhere('audit.ip_address = :ipAddress', {
        ipAddress: filters.ipAddress,
      });
    }

    if (filters.dateRange) {
      if (filters.dateRange.start) {
        queryBuilder.andWhere('audit.created_at >= :startDate', {
          startDate: filters.dateRange.start,
        });
      }
      if (filters.dateRange.end) {
        queryBuilder.andWhere('audit.created_at <= :endDate', {
          endDate: filters.dateRange.end,
        });
      }
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
   * Cleanup old audit logs beyond the retention period.
   * Default retention is 12 months - logs younger than this are never deleted.
   */
  async cleanupOldLogs(retentionMonths: number = DEFAULT_RETENTION_MONTHS): Promise<number> {
    if (retentionMonths < DEFAULT_RETENTION_MONTHS) {
      this.logger.warn(
        `Retention period ${retentionMonths} months is below minimum (${DEFAULT_RETENTION_MONTHS}). Using minimum.`,
      );
      retentionMonths = DEFAULT_RETENTION_MONTHS;
    }

    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - retentionMonths);

    const result = await this.auditLogRepository.delete({
      createdAt: LessThan(cutoffDate),
    });

    const deletedCount = result.affected || 0;
    this.logger.log(
      `Cleaned up ${deletedCount} audit logs older than ${retentionMonths} months`,
    );

    return deletedCount;
  }
}
