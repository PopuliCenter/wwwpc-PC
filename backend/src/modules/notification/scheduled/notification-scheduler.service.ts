import { Injectable, Logger, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { NotificationService } from '../notification.service';
import { DeviceTokenService } from '../device-token.service';
import { NotificationFeedService } from '../notification-feed.service';
import { Survey } from '@modules/survey/entities/survey.entity';
import { SurveyResponse, ResponseStatus } from '@modules/response/entities/survey-response.entity';
import { User } from '@modules/auth/entities/user.entity';
import { UserProfile } from '@modules/registration/entities/user-profile.entity';
import { SurveyStatus } from '@shared/enums';

/** Kriteria penargetan undangan (semua opsional). */
export interface TargetCriteria {
  provinces?: string[];
  genders?: string[];
  educations?: string[];
  ageMin?: number;
  ageMax?: number;
  /** Ambil acak sejumlah ini dari TOTAL yang cocok (kosong = semua yang cocok). */
  sampleSize?: number;
  /** Kuota terstratifikasi: ambil acak sejumlah ini PER PROVINSI (menimpa sampleSize). */
  perProvince?: number;
}

type InviteRecipient = { id: string; email: string; fullName: string };
type MatchRow = InviteRecipient & { province: string | null };

@Injectable()
export class NotificationSchedulerService {
  private readonly logger = new Logger(NotificationSchedulerService.name);
  private readonly baseUrl: string;

  constructor(
    private readonly notificationService: NotificationService,
    private readonly configService: ConfigService,
    @InjectRepository(Survey)
    private readonly surveyRepository: Repository<Survey>,
    @InjectRepository(SurveyResponse)
    private readonly responseRepository: Repository<SurveyResponse>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly deviceTokenService: DeviceTokenService,
    private readonly feedService: NotificationFeedService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {
    // Base URL untuk tautan di email (undangan survei, reminder). Urutan: env
    // khusus APP_BASE_URL → APP_URL (dipakai template email lain) → default
    // PRODUKSI. Jangan pernah jatuh ke localhost: tautan localhost yang bocor ke
    // email responden tak bisa dibuka. Set APP_BASE_URL=http://localhost:3000 di
    // .env lokal bila perlu menguji tautan dev.
    this.baseUrl =
      this.configService.get<string>('APP_BASE_URL') ??
      this.configService.get<string>('APP_URL') ??
      'https://survei.risetcenter.com';
  }

  /**
   * Run daily at 9:00 AM to send H-3 reminders
   * Finds active surveys with deadline in exactly 3 days and sends reminders
   * to respondents who haven't filled them yet.
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async sendH3Reminders(): Promise<void> {
    this.logger.log('Running H-3 reminder job...');

    try {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 3);

      const surveys = await this.findSurveysWithDeadlineOn(targetDate);

      for (const survey of surveys) {
        // Idempotensi (M2): lewati bila reminder H-3 untuk survei ini sudah
        // terkirim hari ini (mis. cron ter-retrigger saat restart / multi-replika).
        if (await this.reminderAlreadySent(survey.id, 'h3')) continue;

        const pendingRespondents = await this.findRespondentsWhoHaventFilled(survey.id);

        if (pendingRespondents.length > 0) {
          await this.notificationService.sendReminder(
            pendingRespondents,
            {
              title: survey.title,
              endDatetime: survey.endDatetime?.toISOString() ?? '',
              id: survey.id,
            },
            3,
            this.baseUrl,
          );
          this.logger.log(
            `Sent H-3 reminders for survey "${survey.title}" to ${pendingRespondents.length} respondents`,
          );
        }
      }

      this.logger.log(`H-3 reminder job completed. Processed ${surveys.length} surveys.`);
    } catch (error: any) {
      this.logger.error(`H-3 reminder job failed: ${error.message}`, error.stack);
    }
  }

  /**
   * Run daily at 9:00 AM to send H-1 reminders
   * Finds active surveys with deadline in exactly 1 day and sends reminders
   * to respondents who haven't filled them yet.
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async sendH1Reminders(): Promise<void> {
    this.logger.log('Running H-1 reminder job...');

    try {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 1);

      const surveys = await this.findSurveysWithDeadlineOn(targetDate);

      for (const survey of surveys) {
        // Idempotensi (M2): lewati bila reminder H-1 untuk survei ini sudah
        // terkirim hari ini.
        if (await this.reminderAlreadySent(survey.id, 'h1')) continue;

        const pendingRespondents = await this.findRespondentsWhoHaventFilled(survey.id);

        if (pendingRespondents.length > 0) {
          await this.notificationService.sendReminder(
            pendingRespondents,
            {
              title: survey.title,
              endDatetime: survey.endDatetime?.toISOString() ?? '',
              id: survey.id,
            },
            1,
            this.baseUrl,
          );
          this.logger.log(
            `Sent H-1 reminders for survey "${survey.title}" to ${pendingRespondents.length} respondents`,
          );
        }
      }

      this.logger.log(`H-1 reminder job completed. Processed ${surveys.length} surveys.`);
    } catch (error: any) {
      this.logger.error(`H-1 reminder job failed: ${error.message}`, error.stack);
    }
  }

  /**
   * Idempotensi reminder (M2): kembalikan true bila reminder (survei, tipe) sudah
   * dikirim HARI INI, sekaligus menandainya bila belum. Mencegah kirim ganda saat
   * cron ter-retrigger (restart tepat jam 9) atau berjalan di >1 replika.
   */
  private async reminderAlreadySent(surveyId: string, kind: 'h3' | 'h1'): Promise<boolean> {
    const day = new Date().toISOString().slice(0, 10);
    const key = `reminder-sent:${kind}:${surveyId}:${day}`;
    const seen = await this.cacheManager.get(key);
    if (seen) return true;
    await this.cacheManager.set(key, 1, 2 * 24 * 60 * 60 * 1000); // TTL 2 hari
    return false;
  }

  /**
   * Kirim email undangan "survei baru" secara MANUAL (dipicu admin via tombol).
   * Hanya untuk survei berstatus aktif, dan hanya ke responden yang BELUM
   * mengisi survei ini (aman dikirim ulang — yang sudah mengisi tidak diganggu).
   * Mengembalikan jumlah penerima yang di-antre.
   */
  async sendInvitationsForSurvey(
    surveyId: string,
  ): Promise<{ recipients: number; pushed: number }> {
    const survey = await this.surveyRepository.findOne({ where: { id: surveyId } });
    if (!survey) {
      throw new NotFoundException(`Survei ${surveyId} tidak ditemukan`);
    }
    if (survey.status !== SurveyStatus.ACTIVE) {
      throw new BadRequestException('Aktifkan survei terlebih dahulu sebelum mengirim undangan.');
    }

    const respondents = await this.findRespondentsWhoHaventFilled(surveyId);
    if (respondents.length === 0) {
      this.logger.log(`Tidak ada responden untuk diundang pada survei ${surveyId}`);
      return { recipients: 0, pushed: 0 };
    }

    const pushed = await this.dispatchInvitations(survey, respondents);
    this.logger.log(
      `Undangan manual untuk survei "${survey.title}" → ${respondents.length} email, ${pushed} push`,
    );
    return { recipients: respondents.length, pushed };
  }

  /**
   * Hitung jumlah responden yang COCOK kriteria & belum mengisi survei (untuk
   * pratinjau sebelum mengirim undangan bertarget). Tidak mengirim apa pun.
   */
  async countTargetedAudience(
    surveyId: string,
    criteria: TargetCriteria,
  ): Promise<{ matching: number }> {
    const qb = await this.buildTargetedQuery(surveyId, criteria);
    return { matching: await qb.getCount() };
  }

  /**
   * Kirim undangan BERTARGET: pilih responden yang cocok kriteria (provinsi,
   * gender, umur, pendidikan) & belum mengisi, opsional ambil ACAK sejumlah
   * `sampleSize`, lalu kirim (email + lonceng + push). Survei harus aktif.
   */
  async sendTargetedInvitations(
    surveyId: string,
    criteria: TargetCriteria,
  ): Promise<{ recipients: number; pushed: number }> {
    const survey = await this.surveyRepository.findOne({ where: { id: surveyId } });
    if (!survey) {
      throw new NotFoundException(`Survei ${surveyId} tidak ditemukan`);
    }
    if (survey.status !== SurveyStatus.ACTIVE) {
      throw new BadRequestException('Aktifkan survei terlebih dahulu sebelum mengirim undangan.');
    }

    const qb = await this.buildTargetedQuery(surveyId, criteria);
    const matching = (await qb.getRawMany()) as MatchRow[];

    // Sampling acak di sisi aplikasi (aman lintas-DB).
    let recipients: InviteRecipient[];
    if (criteria.perProvince && criteria.perProvince > 0) {
      // Kuota terstratifikasi: ambil acak N per provinsi.
      const byProvince = new Map<string, MatchRow[]>();
      for (const r of matching) {
        const key = r.province ?? '-';
        const list = byProvince.get(key) ?? [];
        list.push(r);
        byProvince.set(key, list);
      }
      recipients = [];
      for (const group of byProvince.values()) {
        recipients.push(...this.shuffle(group).slice(0, criteria.perProvince));
      }
    } else if (
      criteria.sampleSize &&
      criteria.sampleSize > 0 &&
      criteria.sampleSize < matching.length
    ) {
      recipients = this.shuffle(matching).slice(0, criteria.sampleSize);
    } else {
      recipients = matching;
    }

    if (recipients.length === 0) {
      return { recipients: 0, pushed: 0 };
    }

    const pushed = await this.dispatchInvitations(survey, recipients);
    this.logger.log(
      `Undangan bertarget "${survey.title}" → ${recipients.length}/${matching.length} cocok, ${pushed} push`,
    );
    return { recipients: recipients.length, pushed };
  }

  /** Kirim undangan (email + lonceng + push) ke daftar responden. Return jumlah push. */
  private async dispatchInvitations(
    survey: Survey,
    respondents: InviteRecipient[],
  ): Promise<number> {
    await this.notificationService.sendSurveyInvitation(
      respondents,
      {
        title: survey.title,
        description: survey.description ?? undefined,
        endDatetime: survey.endDatetime?.toISOString() ?? '',
        id: survey.id,
      },
      this.baseUrl,
    );

    // Isi notifikasi yang informatif: tampilkan poin & estimasi agar responden
    // langsung tahu "survei apa & bagaimana" dari banner sistem (judul = nama survei).
    const rewardPoints = survey.rewardConfig?.pointsValue ?? null;
    const estimate = survey.maxDurationMinutes ?? null;
    const detailParts: string[] = [];
    if (rewardPoints) detailParts.push(`${rewardPoints} poin`);
    if (estimate) detailParts.push(`±${estimate} menit`);
    const body = detailParts.length
      ? `${detailParts.join(' • ')}. Ketuk untuk mulai mengisi.`
      : 'Ada survei baru yang bisa Anda isi. Ketuk untuk membuka.';
    const link = `/surveys/${survey.id}/fill`;

    await this.feedService
      .createForUsers(
        respondents.map((r) => r.id),
        { type: 'survey_new', title: `Survei baru: ${survey.title}`, body, link },
      )
      .catch((e) => this.logger.warn(`Gagal menulis feed undangan: ${e.message}`));

    return this.deviceTokenService
      .pushToUsers(
        respondents.map((r) => r.id),
        { title: `Survei baru: ${survey.title}`, body, data: { link } },
      )
      .catch((e) => {
        this.logger.warn(`Gagal mengirim push undangan: ${e.message}`);
        return 0;
      });
  }

  /** Query builder responden yang cocok kriteria & BELUM mengisi survei. */
  private async buildTargetedQuery(surveyId: string, criteria: TargetCriteria) {
    // Hanya kecualikan yang sudah SELESAI mengisi. Responden yang baru memulai
    // (in_progress) atau meninggalkan (abandoned) TETAP layak diundang/diingatkan
    // — merekalah yang paling perlu didorong (H2).
    const existing = await this.responseRepository.find({
      where: { surveyId, status: ResponseStatus.COMPLETE },
      select: ['respondentId'],
    });
    const respondedIds = existing.map((r) => r.respondentId);

    const qb = this.userRepository
      .createQueryBuilder('u')
      .innerJoin(UserProfile, 'p', 'p.user_id = u.id')
      .select('u.id', 'id')
      .addSelect('u.email', 'email')
      .addSelect('u.fullName', 'fullName')
      .addSelect('p.province', 'province')
      .where('u.emailVerified = :verified', { verified: true })
      .andWhere('u.profileCompleted = :completed', { completed: true })
      .andWhere('u.status = :status', { status: 'active' })
      .andWhere('u.role = :role', { role: 'respondent' });

    if (criteria.provinces?.length) {
      qb.andWhere('p.province IN (:...provinces)', { provinces: criteria.provinces });
    }
    if (criteria.genders?.length) {
      qb.andWhere('p.gender IN (:...genders)', { genders: criteria.genders });
    }
    if (criteria.educations?.length) {
      qb.andWhere('p.education IN (:...educations)', { educations: criteria.educations });
    }
    if (criteria.ageMin != null) {
      qb.andWhere("date_part('year', age(p.date_of_birth)) >= :ageMin", {
        ageMin: criteria.ageMin,
      });
    }
    if (criteria.ageMax != null) {
      qb.andWhere("date_part('year', age(p.date_of_birth)) <= :ageMax", {
        ageMax: criteria.ageMax,
      });
    }
    if (respondedIds.length > 0) {
      qb.andWhere('u.id NOT IN (:...respondedIds)', { respondedIds });
    }
    return qb;
  }

  /** Fisher-Yates shuffle (salinan, tidak mengubah input). */
  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /**
   * Find active surveys whose end_datetime falls on the target date
   */
  private async findSurveysWithDeadlineOn(targetDate: Date): Promise<Survey[]> {
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    return this.surveyRepository.find({
      where: {
        status: SurveyStatus.ACTIVE,
        endDatetime: Between(startOfDay, endOfDay),
      },
    });
  }

  /**
   * Find respondents who are eligible but haven't submitted a response for the given survey.
   * Returns respondents with verified email and completed profile who don't have a response.
   */
  private async findRespondentsWhoHaventFilled(
    surveyId: string,
  ): Promise<Array<{ id: string; email: string; fullName: string }>> {
    // Hanya yang sudah SELESAI yang dikecualikan; in_progress/abandoned tetap
    // diingatkan (H2) — mereka justru target utama pengingat.
    const existingResponses = await this.responseRepository.find({
      where: { surveyId, status: ResponseStatus.COMPLETE },
      select: ['respondentId'],
    });
    const respondedIds = existingResponses.map((r) => r.respondentId);

    // Find all eligible respondents who haven't responded
    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .select(['user.id', 'user.email', 'user.fullName'])
      .where('user.emailVerified = :verified', { verified: true })
      .andWhere('user.profileCompleted = :completed', { completed: true })
      .andWhere('user.status = :status', { status: 'active' })
      .andWhere('user.role = :role', { role: 'respondent' });

    if (respondedIds.length > 0) {
      queryBuilder.andWhere('user.id NOT IN (:...respondedIds)', { respondedIds });
    }

    return queryBuilder.getMany();
  }
}
