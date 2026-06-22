import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { In, Repository, LessThan, ILike } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { User } from '@modules/auth/entities/user.entity';
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
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Log an audit event with all required fields.
   */
  async log(event: AuditEvent): Promise<void> {
    // Audit bersifat best-effort: kegagalan menulis log TIDAK boleh
    // menggagalkan aksi inti (mis. reset password / aktivasi user).
    try {
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
    } catch (error: any) {
      this.logger.error(
        `Gagal menulis audit log (${event.actionType} di ${event.module}): ${error.message}`,
      );
    }
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
      // Field "User ID/Nama": terima UUID (cocok persis) ATAU nama/email
      // (pencarian parsial). Tanpa ini, mengetik nama mengirim teks bukan-UUID
      // ke kolom uuid → Postgres 500 ("invalid input syntax for type uuid").
      const raw = filters.userId.trim();
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw);
      if (isUuid) {
        queryBuilder.andWhere('audit.user_id = :userId', { userId: raw });
      } else {
        const matched = await this.userRepository.find({
          where: [{ fullName: ILike(`%${raw}%`) }, { email: ILike(`%${raw}%`) }],
          select: ['id'],
        });
        const matchedIds = matched.map((u) => u.id);
        if (matchedIds.length === 0) {
          // Tak ada user cocok → hasil kosong (bukan error).
          queryBuilder.andWhere('1 = 0');
        } else {
          queryBuilder.andWhere('audit.user_id IN (:...userIds)', {
            userIds: matchedIds,
          });
        }
      }
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

    // Kumpulkan id user yang dirujuk (pelaku + target di details) → resolve nama
    const ids = new Set<string>();
    for (const e of data) {
      if (e.userId) ids.add(e.userId);
      const t = (e.details as Record<string, any> | null)?.targetUserId;
      if (typeof t === 'string') ids.add(t);
    }

    const userMap = new Map<string, { fullName: string; role: string }>();
    if (ids.size > 0) {
      const users = await this.userRepository.find({
        where: { id: In([...ids]) },
        select: ['id', 'fullName', 'role'],
      });
      for (const u of users) {
        userMap.set(u.id, { fullName: u.fullName, role: u.role });
      }
    }

    const enriched = data.map((e) => {
      const actor = userMap.get(e.userId);
      const details: Record<string, any> = { ...((e.details as Record<string, any>) ?? {}) };
      if (typeof details.targetUserId === 'string' && userMap.has(details.targetUserId)) {
        details.targetUserName = userMap.get(details.targetUserId)!.fullName;
      }
      return {
        ...e,
        userName: actor?.fullName ?? null,
        userRole: actor?.role ?? null,
        details,
      };
    });

    return {
      data: enriched,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** Hapus audit log terpilih (super_admin). Mengembalikan jumlah terhapus. */
  async deleteByIds(ids: string[]): Promise<number> {
    if (!ids || ids.length === 0) return 0;
    const res = await this.auditLogRepository.delete({ id: In(ids) });
    return res.affected || 0;
  }

  /**
   * Purge MANUAL: hapus log lebih lama dari `days` hari (aksi disengaja
   * super_admin). Tanpa batas minimum retensi — beda dari pembersihan otomatis.
   */
  async purgeOlderThanDays(days: number): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - Math.max(0, days));
    const res = await this.auditLogRepository.delete({
      createdAt: LessThan(cutoff),
    });
    const deleted = res.affected || 0;
    this.logger.log(`Purge manual: ${deleted} audit log > ${days} hari dihapus`);
    return deleted;
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

  /**
   * Pembersihan otomatis audit log lama (tanggal 1 tiap bulan, tengah malam)
   * sesuai periode retensi default. Best-effort — kegagalan hanya dicatat.
   */
  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)
  async scheduledAuditCleanup(): Promise<void> {
    try {
      await this.cleanupOldLogs();
    } catch (err: any) {
      this.logger.error(`Gagal cleanup audit log terjadwal: ${err.message}`);
    }
  }
}
