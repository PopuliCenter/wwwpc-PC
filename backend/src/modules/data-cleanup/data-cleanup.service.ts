import {
  Injectable,
  Logger,
  PreconditionFailedException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { S3StorageService } from '@modules/export/s3-storage.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CronLockService, CRON_LOCK_TTL_DAILY_MS } from '../../common/scheduling/cron-lock.service';
import { v4 as uuidv4 } from 'uuid';
import { SurveyResponse } from '@modules/response/entities/survey-response.entity';
import { Survey } from '@modules/survey/entities/survey.entity';
import { User } from '@modules/auth/entities/user.entity';
import { UserProfile } from '@modules/registration/entities/user-profile.entity';
import { Geolocation } from '@modules/geolocation/entities/geolocation.entity';
import { AuditService } from '@modules/audit/audit.service';
import { ScheduledPurgeConfig } from './entities/scheduled-purge-config.entity';
import { PendingDeletion } from './entities/pending-deletion.entity';
import { AuditActionType, SurveyStatus, UserRole } from '@shared/enums';
import {
  DeletionRequest,
  DeletionResult,
  CleanupFilter,
  CleanupCandidate,
  PurgeConfig,
} from './interfaces';

const CONFIRMATION_EXPIRY_MINUTES = 30;

@Injectable()
export class DataCleanupService {
  private readonly logger = new Logger(DataCleanupService.name);

  constructor(
    @InjectRepository(PendingDeletion)
    private readonly pendingDeletionRepository: Repository<PendingDeletion>,
    @InjectRepository(SurveyResponse)
    private readonly responseRepository: Repository<SurveyResponse>,
    @InjectRepository(Survey)
    private readonly surveyRepository: Repository<Survey>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserProfile)
    private readonly userProfileRepository: Repository<UserProfile>,
    @InjectRepository(Geolocation)
    private readonly geolocationRepository: Repository<Geolocation>,
    @InjectRepository(ScheduledPurgeConfig)
    private readonly purgeConfigRepository: Repository<ScheduledPurgeConfig>,
    private readonly auditService: AuditService,
    private readonly s3: S3StorageService,
    private readonly cronLock: CronLockService,
  ) {}

  /**
   * Request deletion of survey responses.
   * Only responses that have been exported (exportedAt != null) can be deleted.
   * Returns a confirmation token for double confirmation.
   */
  async requestDeletion(
    request: DeletionRequest,
    adminUserId: string,
    ipAddress: string,
  ): Promise<DeletionResult> {
    const queryBuilder = this.responseRepository.createQueryBuilder('response');

    if (request.surveyId) {
      queryBuilder.andWhere('response.survey_id = :surveyId', {
        surveyId: request.surveyId,
      });
    }

    if (request.dateRange) {
      queryBuilder.andWhere('response.submitted_at >= :start', {
        start: request.dateRange.start,
      });
      queryBuilder.andWhere('response.submitted_at <= :end', {
        end: request.dateRange.end,
      });
    }

    const responses = await queryBuilder.getMany();

    if (responses.length === 0) {
      throw new NotFoundException('No responses found matching the criteria');
    }

    // Validate all responses have been exported
    const unexportedResponses = responses.filter((r) => r.exportedAt === null);
    if (unexportedResponses.length > 0) {
      throw new PreconditionFailedException(
        `Cannot delete: ${unexportedResponses.length} response(s) have not been exported yet. All responses must be exported before deletion.`,
      );
    }

    const requestId = uuidv4();
    const confirmationToken = uuidv4();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + CONFIRMATION_EXPIRY_MINUTES);

    // Bersihkan permintaan kedaluwarsa (best-effort) agar tabel tetap ramping.
    await this.pendingDeletionRepository.delete({ expiresAt: LessThan(new Date()) });

    await this.pendingDeletionRepository.save(
      this.pendingDeletionRepository.create({
        id: requestId,
        filters: request as Record<string, any>,
        confirmationToken,
        affectedCount: responses.length,
        expiresAt,
        confirmed: false,
        adminUserId,
      }),
    );

    await this.auditService.log({
      userId: adminUserId,
      actionType: AuditActionType.DATA_CLEANUP,
      module: 'data-cleanup',
      details: {
        action: 'deletion_requested',
        requestId,
        affectedCount: responses.length,
        filters: request,
      },
      ipAddress,
    });

    return {
      requestId,
      confirmationToken,
      affectedCount: responses.length,
      expiresAt,
    };
  }

  /**
   * Confirm a pending deletion request (double confirmation step).
   * Validates the confirmation token and executes the deletion.
   */
  async confirmDeletion(
    requestId: string,
    confirmationToken: string,
    adminUserId: string,
    ipAddress: string,
  ): Promise<{ deletedCount: number }> {
    const pending = await this.pendingDeletionRepository.findOne({
      where: { id: requestId },
    });

    if (!pending) {
      throw new NotFoundException('Deletion request not found or has expired');
    }

    if (pending.confirmationToken !== confirmationToken) {
      throw new BadRequestException('Invalid confirmation token');
    }

    if (new Date() > new Date(pending.expiresAt)) {
      await this.pendingDeletionRepository.delete(requestId);
      throw new BadRequestException('Deletion request has expired');
    }

    if (pending.confirmed) {
      throw new BadRequestException('Deletion request has already been confirmed');
    }

    // Execute the deletion
    const queryBuilder = this.responseRepository.createQueryBuilder('response');

    if (pending.filters.surveyId) {
      queryBuilder.andWhere('response.survey_id = :surveyId', {
        surveyId: pending.filters.surveyId,
      });
    }

    if (pending.filters.dateRange) {
      queryBuilder.andWhere('response.submitted_at >= :start', {
        start: new Date(pending.filters.dateRange.start),
      });
      queryBuilder.andWhere('response.submitted_at <= :end', {
        end: new Date(pending.filters.dateRange.end),
      });
    }

    // Only delete exported responses
    queryBuilder.andWhere('response.exported_at IS NOT NULL');

    // Backup SEBELUM hard-delete: snapshot JSON respons + jawaban yang akan
    // dihapus ke object storage. Bila backup gagal, penghapusan DIBATALKAN.
    const backupKey = await this.backupBeforeDeletion(requestId, pending.filters);

    const result = await queryBuilder.delete().execute();
    const deletedCount = result.affected || 0;

    await this.pendingDeletionRepository.delete(requestId);

    await this.auditService.log({
      userId: adminUserId,
      actionType: AuditActionType.DATA_CLEANUP,
      module: 'data-cleanup',
      details: {
        action: 'deletion_confirmed',
        requestId,
        deletedCount,
        backupKey,
      },
      ipAddress,
    });

    return { deletedCount };
  }

  /**
   * Snapshot respons + jawaban yang akan dihapus ke object storage (JSON)
   * sebelum penghapusan permanen. Mengembalikan key backup; MELEMPAR bila gagal
   * agar penghapusan tidak berjalan tanpa cadangan.
   */
  private async backupBeforeDeletion(
    requestId: string,
    filters: { surveyId?: string; dateRange?: { start: unknown; end: unknown } },
  ): Promise<string> {
    const qb = this.responseRepository
      .createQueryBuilder('response')
      .leftJoinAndSelect('response.answers', 'answer')
      .where('response.exported_at IS NOT NULL');
    if (filters.surveyId) {
      qb.andWhere('response.survey_id = :surveyId', { surveyId: filters.surveyId });
    }
    if (filters.dateRange) {
      qb.andWhere('response.submitted_at >= :start', {
        start: new Date(filters.dateRange.start as string),
      });
      qb.andWhere('response.submitted_at <= :end', {
        end: new Date(filters.dateRange.end as string),
      });
    }
    const responses = await qb.getMany();

    const backupKey = `backups/deletion-${requestId}-${Date.now()}.json`;
    try {
      const snapshot = JSON.stringify(
        {
          requestId,
          backedUpAt: new Date().toISOString(),
          filters,
          count: responses.length,
          responses,
        },
        null,
        2,
      );
      await this.s3.uploadBuffer(Buffer.from(snapshot, 'utf-8'), backupKey, 'application/json');
    } catch (err: any) {
      this.logger.error(`Backup gagal untuk ${requestId}: ${err.message}`);
      throw new InternalServerErrorException(
        'Backup data gagal — penghapusan dibatalkan demi keamanan data.',
      );
    }
    this.logger.log(
      `Backup ${responses.length} respons → ${backupKey} sebelum penghapusan ${requestId}`,
    );
    return backupKey;
  }

  /**
   * Archive a survey by setting its status to ARCHIVED.
   */
  async archiveSurvey(surveyId: string, adminUserId: string, ipAddress: string): Promise<void> {
    const survey = await this.surveyRepository.findOne({
      where: { id: surveyId },
    });

    if (!survey) {
      throw new NotFoundException(`Survey with id ${surveyId} not found`);
    }

    survey.status = SurveyStatus.ARCHIVED;
    survey.archivedAt = new Date();
    await this.surveyRepository.save(survey);

    await this.auditService.log({
      userId: adminUserId,
      actionType: AuditActionType.DATA_CLEANUP,
      module: 'data-cleanup',
      details: {
        action: 'survey_archived',
        surveyId,
        surveyTitle: survey.title,
      },
      ipAddress,
    });
  }

  /**
   * Get cleanup candidates based on filters.
   */
  async getCleanupCandidates(filters: CleanupFilter): Promise<CleanupCandidate[]> {
    const queryBuilder = this.responseRepository
      .createQueryBuilder('response')
      .leftJoin('response.survey', 'survey')
      .select('response.survey_id', 'surveyId')
      .addSelect('survey.title', 'surveyTitle')
      .addSelect('COUNT(response.id)', 'totalResponses')
      .addSelect(
        'COUNT(response.id) FILTER (WHERE response.exported_at IS NOT NULL)',
        'exportedResponses',
      )
      // Dapat dihapus = sudah diekspor DAN belum diarsipkan.
      .addSelect(
        'COUNT(response.id) FILTER (WHERE response.exported_at IS NOT NULL AND response.archived_at IS NULL)',
        'deletableCount',
      )
      .addSelect('MAX(response.exported_at)', 'lastExportDate')
      .groupBy('response.survey_id')
      .addGroupBy('survey.title');

    if (filters.surveyId) {
      queryBuilder.andWhere('response.survey_id = :surveyId', {
        surveyId: filters.surveyId,
      });
    }

    if (filters.dateRange) {
      queryBuilder.andWhere('response.submitted_at >= :start', {
        start: filters.dateRange.start,
      });
      queryBuilder.andWhere('response.submitted_at <= :end', {
        end: filters.dateRange.end,
      });
    }

    if (filters.surveyStatus) {
      queryBuilder.andWhere('survey.status = :surveyStatus', {
        surveyStatus: filters.surveyStatus,
      });
    }

    // "Hanya yang sudah diekspor": tampilkan survei yang punya ≥1 respons
    // terekspor (kandidat layak dibersihkan), tanpa memfilter hitungan total.
    if (filters.exportStatus === 'exported_only') {
      queryBuilder.having('COUNT(response.id) FILTER (WHERE response.exported_at IS NOT NULL) > 0');
    }

    const results = await queryBuilder.getRawMany();

    return results.map((r) => ({
      surveyId: r.surveyId,
      surveyTitle: r.surveyTitle,
      totalResponses: parseInt(r.totalResponses, 10),
      exportedResponses: parseInt(r.exportedResponses, 10),
      deletableCount: parseInt(r.deletableCount, 10),
      lastExportDate: r.lastExportDate ? new Date(r.lastExportDate) : null,
    }));
  }

  /**
   * Delete personal data for GDPR compliance.
   * Requires Super_Admin approval.
   */
  async deletePersonalData(
    respondentId: string,
    superAdminApproval: string,
    adminUserId: string,
    ipAddress: string,
  ): Promise<void> {
    // Validate super admin approval - the approval token is the super admin's userId
    const superAdmin = await this.userRepository.findOne({
      where: { id: superAdminApproval },
    });

    if (!superAdmin || superAdmin.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('GDPR data deletion requires valid Super Admin approval');
    }

    const user = await this.userRepository.findOne({
      where: { id: respondentId },
    });

    if (!user) {
      throw new NotFoundException(`User with id ${respondentId} not found`);
    }

    // Anonymize user PII
    user.fullName = '[DELETED]';
    user.email = `deleted_${respondentId}@anonymized.local`;
    user.phone = '0000000000';
    await this.userRepository.save(user);

    // Delete UserProfile
    await this.userProfileRepository.delete({ userId: respondentId });

    // Delete Geolocation records
    await this.geolocationRepository.delete({ userId: respondentId });

    await this.auditService.log({
      userId: adminUserId,
      actionType: AuditActionType.DATA_CLEANUP,
      module: 'data-cleanup',
      details: {
        action: 'gdpr_personal_data_deleted',
        respondentId,
        approvedBy: superAdminApproval,
      },
      ipAddress,
    });
  }

  /**
   * Configure scheduled purge settings.
   */
  async configureScheduledPurge(config: PurgeConfig): Promise<ScheduledPurgeConfig> {
    // Get existing config or create new one
    let purgeConfig = await this.purgeConfigRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' },
    });

    if (!purgeConfig) {
      purgeConfig = this.purgeConfigRepository.create();
    }

    purgeConfig.retentionDays = config.retentionDays;
    purgeConfig.enabled = config.enabled;
    purgeConfig.cronExpression = config.cronExpression;

    return this.purgeConfigRepository.save(purgeConfig);
  }

  /**
   * Execute scheduled purge - deletes exported responses older than retention period.
   * Runs daily at 2 AM by default.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async executeScheduledPurge(): Promise<{ deletedCount: number }> {
    // Multi-replika: hanya satu replika yang mengeksekusi per jadwal.
    if (!(await this.cronLock.acquire('scheduled-purge', CRON_LOCK_TTL_DAILY_MS))) {
      return { deletedCount: 0 };
    }
    const config = await this.purgeConfigRepository.findOne({
      where: { enabled: true },
      order: { createdAt: 'DESC' },
    });

    if (!config) {
      this.logger.debug('Scheduled purge is not configured or disabled');
      return { deletedCount: 0 };
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - config.retentionDays);

    const result = await this.responseRepository
      .createQueryBuilder('response')
      .delete()
      .where('response.exported_at IS NOT NULL')
      .andWhere('response.submitted_at < :cutoffDate', { cutoffDate })
      .execute();

    const deletedCount = result.affected || 0;

    config.lastRunAt = new Date();
    await this.purgeConfigRepository.save(config);

    await this.auditService.log({
      userId: 'system',
      actionType: AuditActionType.DATA_CLEANUP,
      module: 'data-cleanup',
      details: {
        action: 'scheduled_purge_executed',
        deletedCount,
        retentionDays: config.retentionDays,
        cutoffDate: cutoffDate.toISOString(),
      },
      ipAddress: '0.0.0.0',
    });

    this.logger.log(
      `Scheduled purge completed: deleted ${deletedCount} responses older than ${config.retentionDays} days`,
    );

    return { deletedCount };
  }
}
