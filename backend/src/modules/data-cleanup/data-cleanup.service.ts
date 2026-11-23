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
import { StorageCleanupService } from '@modules/export/storage-cleanup.service';
import { UserManagerService } from '@modules/user-manager/user-manager.service';
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
    private readonly storageCleanup: StorageCleanupService,
    private readonly userManager: UserManagerService,
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
    const { backupKey, uploadKeys } = await this.backupBeforeDeletion(requestId, pending.filters);

    const result = await queryBuilder.delete().execute();
    const deletedCount = result.affected || 0;
    // Berkas jawaban (foto/audio/tanda tangan) ikut dihapus dari MinIO (T-31).
    await this.storageCleanup.deleteUploadKeys(uploadKeys);

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
   * sebelum penghapusan permanen. Mengembalikan key backup (+ key berkas
   * unggahan yang dirujuk jawaban); MELEMPAR bila gagal agar penghapusan tidak
   * berjalan tanpa cadangan. Snapshot ini otomatis kedaluwarsa setelah
   * DELETION_BACKUP_RETENTION_DAYS (default 30) — StorageCleanupService.
   */
  private async backupBeforeDeletion(
    requestId: string,
    filters: { surveyId?: string; dateRange?: { start: unknown; end: unknown } },
  ): Promise<{ backupKey: string; uploadKeys: string[] }> {
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
    // Key unggahan yang dirujuk jawaban respons yang akan dihapus.
    const uploadKeys = responses.flatMap((r) =>
      (r.answers ?? [])
        .map((a) => a.value)
        .filter((v): v is string => typeof v === 'string' && v.startsWith('survey-uploads/')),
    );
    return { backupKey, uploadKeys };
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
   * Penghapusan data pribadi (hak hapus subjek data / GDPR / UU PDP).
   *
   * Dulu: "anonimisasi" yang menyetel phone='0000000000' (bentrok unique index
   * mulai subjek kedua -> 500) dan meninggalkan jawaban, berkas MinIO, avatar,
   * hash sandi, nomor tujuan reward, serta sesi (T-32). Kini memakai jalur yang
   * SAMA dengan hapus akun: seluruh baris terkait + berkas MinIO + cache sesi
   * dihapus permanen (UserManagerService.eraseUserData).
   *
   * Konfirmasi nyata: super admin wajib mengetik ulang EMAIL subjek (bukan lagi
   * sembarang UUID super admin sebagai "persetujuan").
   */
  async deletePersonalData(
    respondentId: string,
    confirmEmail: string,
    adminUserId: string,
    ipAddress: string,
  ): Promise<void> {
    if (respondentId === adminUserId) {
      throw new BadRequestException('Tidak dapat menghapus data akun Anda sendiri di sini.');
    }

    const user = await this.userRepository.findOne({
      where: { id: respondentId },
    });
    if (!user) {
      throw new NotFoundException(`User with id ${respondentId} not found`);
    }
    if (user.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Akun Super Admin tidak dapat dihapus lewat menu ini.');
    }

    const norm = (v: string | null | undefined) => (v ?? '').trim().toLowerCase();
    if (!confirmEmail || norm(confirmEmail) !== norm(user.email)) {
      throw new BadRequestException(
        'Konfirmasi tidak cocok: ketik ulang email responden persis untuk melanjutkan.',
      );
    }

    await this.userManager.eraseUserData(respondentId);

    await this.auditService.log({
      userId: adminUserId,
      actionType: AuditActionType.DATA_CLEANUP,
      module: 'data-cleanup',
      // Tanpa email/nama: jejak audit tidak menyimpan ulang data yang dihapus.
      details: { action: 'gdpr_personal_data_deleted', respondentId, role: user.role },
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

    const uploadKeys = await this.storageCleanup.uploadKeysWhere(
      this.responseRepository.manager,
      'r.exported_at IS NOT NULL AND r.submitted_at < $1',
      [cutoffDate],
    );
    const result = await this.responseRepository
      .createQueryBuilder('response')
      .delete()
      .where('response.exported_at IS NOT NULL')
      .andWhere('response.submitted_at < :cutoffDate', { cutoffDate })
      .execute();

    const deletedCount = result.affected || 0;
    await this.storageCleanup.deleteUploadKeys(uploadKeys);

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
