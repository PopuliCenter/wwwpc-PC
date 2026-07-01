import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { DashboardService } from './dashboard.service';
import { User } from '@modules/auth/entities/user.entity';
import { Survey } from '@modules/survey/entities/survey.entity';
import { SurveyResponse } from '@modules/response/entities/survey-response.entity';
import { Geolocation } from '@modules/geolocation/entities/geolocation.entity';
import { UserProfile } from '@modules/registration/entities/user-profile.entity';

describe('DashboardService', () => {
  let service: DashboardService;
  let userRepo: any;
  let surveyRepo: any;
  let responseRepo: any;
  let geolocationRepo: any;
  let profileRepo: any;
  let cacheManager: any;

  const createMockQueryBuilder = (result: any[] = []) => ({
    select: vi.fn().mockReturnThis(),
    addSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    addGroupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    getCount: vi.fn().mockResolvedValue(result.length > 0 ? result[0] : 0),
    getRawMany: vi.fn().mockResolvedValue(result),
  });

  beforeEach(async () => {
    cacheManager = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    };

    userRepo = {
      createQueryBuilder: vi.fn(),
    };

    surveyRepo = {
      createQueryBuilder: vi.fn(),
    };

    responseRepo = {
      createQueryBuilder: vi.fn(),
      manager: { query: vi.fn().mockResolvedValue([]) },
    };

    geolocationRepo = {
      createQueryBuilder: vi.fn(),
    };

    profileRepo = {
      createQueryBuilder: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Survey), useValue: surveyRepo },
        { provide: getRepositoryToken(SurveyResponse), useValue: responseRepo },
        { provide: getRepositoryToken(Geolocation), useValue: geolocationRepo },
        { provide: getRepositoryToken(UserProfile), useValue: profileRepo },
        { provide: CACHE_MANAGER, useValue: cacheManager },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  describe('getOverviewMetrics', () => {
    it('should return overview metrics from database', async () => {
      const regQb = createMockQueryBuilder();
      regQb.getCount.mockResolvedValue(5);
      const totalQb = createMockQueryBuilder();
      totalQb.getCount.mockResolvedValue(100);
      const surveyQb = createMockQueryBuilder();
      surveyQb.getCount.mockResolvedValue(3);
      const responseQb = createMockQueryBuilder();
      responseQb.getCount.mockResolvedValue(250);

      let callCount = 0;
      userRepo.createQueryBuilder.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? regQb : totalQb;
      });
      surveyRepo.createQueryBuilder.mockReturnValue(surveyQb);
      responseRepo.createQueryBuilder.mockReturnValue(responseQb);

      const result = await service.getOverviewMetrics();

      expect(result).toEqual({
        registrationsLast24h: 5,
        totalRespondents: 100,
        activeSurveys: 3,
        totalResponses: 250,
      });
      // Overview metrics use a 60 s TTL (high traffic, cheap to recompute).
      expect(cacheManager.set).toHaveBeenCalledWith('dashboard:overview', result, 60000);
    });

    it('should return cached data if available', async () => {
      const cachedMetrics = {
        registrationsLast24h: 10,
        totalRespondents: 200,
        activeSurveys: 5,
        totalResponses: 500,
      };
      cacheManager.get.mockResolvedValue(cachedMetrics);

      const result = await service.getOverviewMetrics();

      expect(result).toEqual(cachedMetrics);
      expect(userRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('getRegistrationChart', () => {
    it('should return daily registration chart data', async () => {
      const rawData = [
        { date: '2025-01-01', count: '10' },
        { date: '2025-01-02', count: '15' },
        { date: '2025-01-03', count: '8' },
      ];
      const qb = createMockQueryBuilder(rawData);
      userRepo.createQueryBuilder.mockReturnValue(qb);

      const period = {
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-01-03'),
      };
      const result = await service.getRegistrationChart(period);

      expect(result.labels).toEqual(['2025-01-01', '2025-01-02', '2025-01-03']);
      expect(result.datasets[0].label).toBe('Registrasi Harian');
      expect(result.datasets[0].data).toEqual([10, 15, 8]);
    });

    it('should return cached chart data if available', async () => {
      const cachedChart = {
        labels: ['2025-01-01'],
        datasets: [{ label: 'Registrasi Harian', data: [5] }],
      };
      cacheManager.get.mockResolvedValue(cachedChart);

      const period = {
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-01-01'),
      };
      const result = await service.getRegistrationChart(period);

      expect(result).toEqual(cachedChart);
    });
  });

  describe('getCumulativeTrendChart', () => {
    it('should return cumulative trend data', async () => {
      const rawData = [
        { date: '2025-01-01', count: '10' },
        { date: '2025-01-02', count: '15' },
        { date: '2025-01-03', count: '8' },
      ];
      const qb = createMockQueryBuilder(rawData);
      userRepo.createQueryBuilder.mockReturnValue(qb);

      const period = {
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-01-03'),
      };
      const result = await service.getCumulativeTrendChart(period);

      expect(result.labels).toEqual(['2025-01-01', '2025-01-02', '2025-01-03']);
      expect(result.datasets[0].label).toBe('Tren Kumulatif Registrasi');
      expect(result.datasets[0].data).toEqual([10, 25, 33]);
    });
  });

  describe('getDistributionCharts', () => {
    it('should return distribution data for region, age, and occupation', async () => {
      const regionData = [
        { label: 'DKI Jakarta', value: '50' },
        { label: 'Jawa Barat', value: '30' },
      ];
      const ageData = [
        { label: '18-24', value: '40' },
        { label: '25-34', value: '35' },
      ];
      const occupationData = [
        { label: 'Mahasiswa', value: '25' },
        { label: 'Karyawan', value: '20' },
      ];

      let callCount = 0;
      profileRepo.createQueryBuilder.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return createMockQueryBuilder(regionData);
        if (callCount === 2) return createMockQueryBuilder(ageData);
        return createMockQueryBuilder(occupationData);
      });

      const result = await service.getDistributionCharts();

      expect(result.byRegion).toEqual([
        { label: 'DKI Jakarta', value: 50 },
        { label: 'Jawa Barat', value: 30 },
      ]);
      expect(result.byAge).toEqual([
        { label: '18-24', value: 40 },
        { label: '25-34', value: 35 },
      ]);
      expect(result.byOccupation).toEqual([
        { label: 'Mahasiswa', value: 25 },
        { label: 'Karyawan', value: 20 },
      ]);
    });
  });

  describe('getSurveyCompletionRates', () => {
    it('should return completion rates per survey', async () => {
      const rawData = [
        {
          surveyId: 'survey-1',
          surveyTitle: 'Survey A',
          totalResponses: '100',
          completedResponses: '75',
        },
        {
          surveyId: 'survey-2',
          surveyTitle: 'Survey B',
          totalResponses: '50',
          completedResponses: '50',
        },
      ];
      const qb = createMockQueryBuilder(rawData);
      responseRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getSurveyCompletionRates();

      expect(result).toEqual([
        {
          surveyId: 'survey-1',
          surveyTitle: 'Survey A',
          totalResponses: 100,
          completedResponses: 75,
          completionRate: 75,
        },
        {
          surveyId: 'survey-2',
          surveyTitle: 'Survey B',
          totalResponses: 50,
          completedResponses: 50,
          completionRate: 100,
        },
      ]);
    });

    it('should handle zero total responses', async () => {
      const rawData = [
        {
          surveyId: 'survey-1',
          surveyTitle: 'Empty Survey',
          totalResponses: '0',
          completedResponses: '0',
        },
      ];
      const qb = createMockQueryBuilder(rawData);
      responseRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getSurveyCompletionRates();

      expect(result[0].completionRate).toBe(0);
    });
  });

  describe('getHeatmapData', () => {
    it('should return coordinate points from survey response GPS', async () => {
      const rawRows = [
        {
          lat: '-6.2000',
          lng: '106.8167',
          count: 50,
          city: 'Jakarta',
          respondents: [
            {
              name: 'Budi',
              submittedAt: '2026-01-01T10:00:00.000Z',
              province: 'DKI JAKARTA',
              city: 'Jakarta',
              district: 'Tebet',
            },
          ],
        },
        { lat: '-6.9175', lng: '107.6191', count: 30, city: null, respondents: null },
      ];
      responseRepo.manager.query.mockResolvedValue(rawRows);

      const result = await service.getHeatmapData();

      expect(result).toEqual([
        {
          latitude: -6.2,
          longitude: 106.8167,
          count: 50,
          city: 'Jakarta',
          respondents: [
            {
              name: 'Budi',
              submittedAt: '2026-01-01T10:00:00.000Z',
              province: 'DKI JAKARTA',
              city: 'Jakarta',
              district: 'Tebet',
            },
          ],
        },
        { latitude: -6.9175, longitude: 107.6191, count: 30, city: undefined, respondents: [] },
      ]);
    });

    it('should return cached heatmap data if available', async () => {
      const cachedData = [{ latitude: -7.25, longitude: 112.75, count: 20, city: 'Surabaya' }];
      cacheManager.get.mockResolvedValue(cachedData);

      const result = await service.getHeatmapData();

      expect(result).toEqual(cachedData);
      expect(responseRepo.manager.query).not.toHaveBeenCalled();
    });
  });
});
