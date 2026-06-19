import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { OnEvent } from '@nestjs/event-emitter';
import { EventType } from '@modules/events/event-types';
import { User } from '@modules/auth/entities/user.entity';
import { Survey } from '@modules/survey/entities/survey.entity';
import { SurveyResponse, ResponseStatus } from '@modules/response/entities/survey-response.entity';
import { Geolocation } from '@modules/geolocation/entities/geolocation.entity';
import { UserProfile } from '@modules/registration/entities/user-profile.entity';
import { SurveyStatus, UserRole } from '@shared/enums';
import {
  OverviewMetrics,
  DateRange,
  ChartData,
  DistributionData,
  HeatmapPoint,
  SurveyCompletionRate,
} from './interfaces';

// ---------------------------------------------------------------------------
// Cache TTL constants (milliseconds)
// ---------------------------------------------------------------------------
/** Overview counters refresh every 60 s — high traffic, small payload */
const TTL_OVERVIEW = 60_000;

/** Time-series charts refresh every 5 min */
const TTL_CHART = 300_000;

/** Distribution/heatmap refreshes every 10 min — expensive aggregation */
const TTL_DISTRIBUTION = 600_000;
const TTL_HEATMAP = 600_000;

/** Completion rates refresh every 5 min */
const TTL_COMPLETION = 300_000;

// ---------------------------------------------------------------------------
// Cache key helpers
// ---------------------------------------------------------------------------
const KEY_OVERVIEW = 'dashboard:overview';
const KEY_DISTRIBUTION = 'dashboard:distribution';
const KEY_HEATMAP = 'dashboard:heatmap';
const KEY_COMPLETION = 'dashboard:completion-rates';

function keyChart(type: 'registration' | 'cumulative', range: DateRange): string {
  return `dashboard:${type}:${range.startDate.toISOString()}:${range.endDate.toISOString()}`;
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Survey)
    private readonly surveyRepository: Repository<Survey>,
    @InjectRepository(SurveyResponse)
    private readonly responseRepository: Repository<SurveyResponse>,
    @InjectRepository(Geolocation)
    private readonly geolocationRepository: Repository<Geolocation>,
    @InjectRepository(UserProfile)
    private readonly profileRepository: Repository<UserProfile>,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Overview metrics: registrations in last 24 h, total respondents,
   * active surveys, total responses.
   * Cached for 60 s — updated frequently but cheap to re-compute.
   */
  async getOverviewMetrics(): Promise<OverviewMetrics> {
    return this.cached<OverviewMetrics>(
      KEY_OVERVIEW,
      TTL_OVERVIEW,
      async () => {
        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const [registrationsLast24h, totalRespondents, activeSurveys, totalResponses] =
          await Promise.all([
            this.userRepository
              .createQueryBuilder('user')
              .where('user.role = :role', { role: UserRole.RESPONDENT })
              .andWhere('user.created_at >= :since', { since: twentyFourHoursAgo })
              .getCount(),
            this.userRepository
              .createQueryBuilder('user')
              .where('user.role = :role', { role: UserRole.RESPONDENT })
              .getCount(),
            this.surveyRepository
              .createQueryBuilder('survey')
              .where('survey.status = :status', { status: SurveyStatus.ACTIVE })
              .getCount(),
            this.responseRepository
              .createQueryBuilder('response')
              .getCount(),
          ]);

        return { registrationsLast24h, totalRespondents, activeSurveys, totalResponses };
      },
    );
  }

  /**
   * Daily registration bar chart.
   * Cached for 5 min per unique date range.
   */
  async getRegistrationChart(period: DateRange): Promise<ChartData> {
    return this.cached<ChartData>(
      keyChart('registration', period),
      TTL_CHART,
      async () => {
        const results = await this.userRepository
          .createQueryBuilder('user')
          .select("TO_CHAR(user.created_at, 'YYYY-MM-DD')", 'date')
          .addSelect('COUNT(*)', 'count')
          .where('user.role = :role', { role: UserRole.RESPONDENT })
          .andWhere('user.created_at >= :start', { start: period.startDate })
          .andWhere('user.created_at <= :end', { end: period.endDate })
          .groupBy("TO_CHAR(user.created_at, 'YYYY-MM-DD')")
          .orderBy('date', 'ASC')
          .getRawMany();

        return {
          labels: results.map((r) => r.date),
          datasets: [{ label: 'Registrasi Harian', data: results.map((r) => parseInt(r.count, 10)) }],
        };
      },
    );
  }

  /**
   * Cumulative registration trend line chart.
   * Cached for 5 min per unique date range.
   */
  async getCumulativeTrendChart(period: DateRange): Promise<ChartData> {
    return this.cached<ChartData>(
      keyChart('cumulative', period),
      TTL_CHART,
      async () => {
        const results = await this.userRepository
          .createQueryBuilder('user')
          .select("TO_CHAR(user.created_at, 'YYYY-MM-DD')", 'date')
          .addSelect('COUNT(*)', 'count')
          .where('user.role = :role', { role: UserRole.RESPONDENT })
          .andWhere('user.created_at >= :start', { start: period.startDate })
          .andWhere('user.created_at <= :end', { end: period.endDate })
          .groupBy("TO_CHAR(user.created_at, 'YYYY-MM-DD')")
          .orderBy('date', 'ASC')
          .getRawMany();

        let cumulative = 0;
        const cumulativeData = results.map((r) => {
          cumulative += parseInt(r.count, 10);
          return cumulative;
        });

        return {
          labels: results.map((r) => r.date),
          datasets: [{ label: 'Tren Kumulatif Registrasi', data: cumulativeData }],
        };
      },
    );
  }

  /**
   * Distribution charts (region, age, occupation).
   * Cached for 10 min — expensive aggregation, low volatility.
   */
  async getDistributionCharts(): Promise<DistributionData> {
    return this.cached<DistributionData>(
      KEY_DISTRIBUTION,
      TTL_DISTRIBUTION,
      async () => {
        const [byRegion, byAge, byOccupation] = await Promise.all([
          this.profileRepository
            .createQueryBuilder('profile')
            .select('profile.province', 'label')
            .addSelect('COUNT(*)', 'value')
            .where('profile.province IS NOT NULL')
            .groupBy('profile.province')
            .orderBy('value', 'DESC')
            .getRawMany(),
          this.profileRepository
            .createQueryBuilder('profile')
            .select(
              "CASE " +
              "WHEN profile.age < 18 THEN '<18' " +
              "WHEN profile.age BETWEEN 18 AND 24 THEN '18-24' " +
              "WHEN profile.age BETWEEN 25 AND 34 THEN '25-34' " +
              "WHEN profile.age BETWEEN 35 AND 44 THEN '35-44' " +
              "WHEN profile.age BETWEEN 45 AND 54 THEN '45-54' " +
              "ELSE '55+' END",
              'label',
            )
            .addSelect('COUNT(*)', 'value')
            .where('profile.age IS NOT NULL')
            .groupBy('label')
            .orderBy('label', 'ASC')
            .getRawMany(),
          this.profileRepository
            .createQueryBuilder('profile')
            .select('profile.occupation', 'label')
            .addSelect('COUNT(*)', 'value')
            .where('profile.occupation IS NOT NULL')
            .groupBy('profile.occupation')
            .orderBy('value', 'DESC')
            .limit(10)
            .getRawMany(),
        ]);

        return {
          byRegion:     byRegion.map((r) => ({ label: r.label, value: parseInt(r.value, 10) })),
          byAge:        byAge.map((r) => ({ label: r.label, value: parseInt(r.value, 10) })),
          byOccupation: byOccupation.map((r) => ({ label: r.label, value: parseInt(r.value, 10) })),
        };
      },
    );
  }

  /**
   * Survey completion rates.
   * Cached for 5 min.
   */
  async getSurveyCompletionRates(): Promise<SurveyCompletionRate[]> {
    return this.cached<SurveyCompletionRate[]>(
      KEY_COMPLETION,
      TTL_COMPLETION,
      async () => {
        const results = await this.responseRepository
          .createQueryBuilder('response')
          .select('response.survey_id', 'surveyId')
          .addSelect('survey.title', 'surveyTitle')
          .addSelect('COUNT(*)', 'totalResponses')
          .addSelect(
            `SUM(CASE WHEN response.status = '${ResponseStatus.COMPLETE}' THEN 1 ELSE 0 END)`,
            'completedResponses',
          )
          .innerJoin('response.survey', 'survey')
          .where('survey.status IN (:...statuses)', {
            statuses: [SurveyStatus.ACTIVE, SurveyStatus.INACTIVE],
          })
          .groupBy('response.survey_id')
          .addGroupBy('survey.title')
          .orderBy('"totalResponses"', 'DESC')
          .getRawMany();

        return results.map((r) => {
          const total     = parseInt(r.totalResponses, 10);
          const completed = parseInt(r.completedResponses, 10);
          return {
            surveyId: r.surveyId,
            surveyTitle: r.surveyTitle,
            totalResponses: total,
            completedResponses: completed,
            completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
          };
        });
      },
    );
  }

  /**
   * Geographic heatmap data.
   * Cached for 10 min — geographic distribution changes slowly.
   */
  async getHeatmapData(): Promise<HeatmapPoint[]> {
    return this.cached<HeatmapPoint[]>(
      KEY_HEATMAP,
      TTL_HEATMAP,
      async () => {
        // Titik peta dikumpulkan dari DUA sumber koordinat GPS pengisian survei,
        // lalu digabung & dikelompokkan per ~11 m (pembulatan 4 desimal) agar
        // konsentrasi tidak wajar tampak sebagai satu titik dengan count > 1:
        //   1) Setelan "Rekam lokasi GPS" → survey_response.start_*/end_*.
        //   2) Pertanyaan bertipe GPS → answer.value { latitude, longitude }.
        // Nama kota diambil dari profil responden bila ada.
        const numericRegex = "'^-?[0-9]+(\\.[0-9]+)?$'";
        const rows: Array<{
          lat: string | number;
          lng: string | number;
          count: string | number;
          city: string | null;
          respondents: Array<{
            name: string | null;
            submittedAt: string | null;
            province: string | null;
            city: string | null;
            district: string | null;
          }> | null;
        }> = await this.responseRepository.manager.query(
          `WITH pts AS (
             SELECT COALESCE(r.start_latitude, r.end_latitude) AS lat,
                    COALESCE(r.start_longitude, r.end_longitude) AS lng,
                    r.respondent_id AS respondent_id,
                    COALESCE(r.submitted_at, r.started_at) AS resp_at
             FROM survey_response r
             WHERE COALESCE(r.start_latitude, r.end_latitude) IS NOT NULL
               AND COALESCE(r.start_longitude, r.end_longitude) IS NOT NULL
               AND r.archived_at IS NULL
             UNION ALL
             SELECT (a.value->>'latitude')::double precision AS lat,
                    (a.value->>'longitude')::double precision AS lng,
                    r.respondent_id AS respondent_id,
                    COALESCE(r.submitted_at, r.started_at) AS resp_at
             FROM answer a
             JOIN question q ON q.id = a.question_id AND q.type = 'gps'
             JOIN survey_response r ON r.id = a.response_id
             WHERE (a.value->>'latitude') ~ ${numericRegex}
               AND (a.value->>'longitude') ~ ${numericRegex}
               AND r.archived_at IS NULL
           )
           SELECT ROUND(pts.lat::numeric, 4) AS lat,
                  ROUND(pts.lng::numeric, 4) AS lng,
                  COUNT(*)::int AS count,
                  MAX(p.city) AS city,
                  json_agg(
                    json_build_object(
                      'name', COALESCE(u.full_name, '-'),
                      'submittedAt', pts.resp_at,
                      'province', p.province,
                      'city', p.city,
                      'district', p.district
                    ) ORDER BY pts.resp_at DESC
                  ) AS respondents
           FROM pts
           LEFT JOIN user_profile p ON p.user_id = pts.respondent_id
           LEFT JOIN users u ON u.id = pts.respondent_id
           WHERE pts.lat IS NOT NULL AND pts.lng IS NOT NULL
           GROUP BY 1, 2
           ORDER BY count DESC
           LIMIT 1000`,
        );

        return rows.map((r) => ({
          latitude: Number(r.lat),
          longitude: Number(r.lng),
          count: typeof r.count === 'number' ? r.count : parseInt(r.count, 10),
          city: r.city ?? undefined,
          respondents: Array.isArray(r.respondents)
            ? r.respondents.map((x) => ({
                name: x.name ?? '-',
                submittedAt: x.submittedAt ?? null,
                province: x.province ?? null,
                city: x.city ?? null,
                district: x.district ?? null,
              }))
            : [],
        }));
      },
    );
  }

  /**
   * Invalidate all dashboard cache keys.
   * Call this after a new survey response is submitted or a new user registers
   * so counters reflect the latest state.
   */
  async invalidateDashboardCache(): Promise<void> {
    const keys = [KEY_OVERVIEW, KEY_DISTRIBUTION, KEY_HEATMAP, KEY_COMPLETION];
    await Promise.all(keys.map((k) => this.cacheManager.del(k)));
    this.logger.debug('Dashboard cache invalidated');
  }

  /**
   * Kosongkan cache dashboard begitu ada respons survei masuk, agar angka
   * (overview, distribusi, completion rate) langsung mencerminkan data baru —
   * tidak menunggu TTL 1–10 menit. Best-effort: error hanya dicatat.
   */
  @OnEvent(EventType.RESPONSE_SUBMITTED, { async: true })
  async handleResponseSubmitted(): Promise<void> {
    try {
      await this.invalidateDashboardCache();
    } catch (e: any) {
      this.logger.error(`Gagal invalidasi cache dashboard: ${e?.message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Generic cache-aside helper.
   * 1. Try to read from Redis.
   * 2. On miss, execute `compute()` and store the result with the given TTL.
   */
  private async cached<T>(
    key: string,
    ttlMs: number,
    compute: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.cacheManager.get<T>(key);
    if (cached !== undefined && cached !== null) {
      this.logger.debug(`Cache hit: ${key}`);
      return cached;
    }

    this.logger.debug(`Cache miss: ${key}`);
    const value = await compute();
    await this.cacheManager.set(key, value, ttlMs);
    return value;
  }
}
