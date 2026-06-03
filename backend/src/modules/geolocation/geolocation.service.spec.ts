import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { GeolocationService } from './geolocation.service';
import { Geolocation } from './entities/geolocation.entity';
import { encrypt, decrypt } from './utils';

// Mock global fetch for reverse geocoding
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('GeolocationService', () => {
  let service: GeolocationService;
  let repository: any;
  const ENCRYPTION_KEY = 'test-encryption-key-for-testing!';

  beforeEach(async () => {
    repository = {
      findOne: vi.fn(),
      find: vi.fn(),
      create: vi.fn((data: any) => ({ id: 'geo-1', ...data })),
      save: vi.fn((entity: any) => Promise.resolve({ id: 'geo-1', ...entity })),
      createQueryBuilder: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeolocationService,
        { provide: getRepositoryToken(Geolocation), useValue: repository },
        { provide: ConfigService, useValue: { get: vi.fn().mockReturnValue(ENCRYPTION_KEY) } },
      ],
    }).compile();

    service = module.get<GeolocationService>(GeolocationService);
  });

  describe('captureLocation', () => {
    it('should encrypt coordinates and save with geocoded city/province', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          address: { city: 'Jakarta Selatan', state: 'DKI Jakarta' },
          display_name: 'Jakarta Selatan, DKI Jakarta, Indonesia',
        }),
      });
      repository.findOne.mockResolvedValue(null);

      const result = await service.captureLocation('user-1', {
        latitude: -6.2088,
        longitude: 106.8456,
      });

      expect(result.city).toBe('Jakarta Selatan');
      expect(result.province).toBe('DKI Jakarta');
      expect(result.capturedAt).toBeInstanceOf(Date);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          city: 'Jakarta Selatan',
          province: 'DKI Jakarta',
          encryptedLatitude: expect.any(Buffer),
          encryptedLongitude: expect.any(Buffer),
        }),
      );
      expect(repository.save).toHaveBeenCalled();
    });

    it('should update existing geolocation record', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          address: { city: 'Bandung', state: 'Jawa Barat' },
        }),
      });
      const existingGeo = {
        id: 'geo-existing',
        userId: 'user-1',
        encryptedLatitude: Buffer.from('old'),
        encryptedLongitude: Buffer.from('old'),
        city: 'Old City',
        province: 'Old Province',
        capturedAt: new Date('2025-01-01'),
      };
      repository.findOne.mockResolvedValue(existingGeo);

      const result = await service.captureLocation('user-1', {
        latitude: -6.9175,
        longitude: 107.6191,
      });

      expect(result.city).toBe('Bandung');
      expect(result.province).toBe('Jawa Barat');
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'geo-existing',
          city: 'Bandung',
          province: 'Jawa Barat',
        }),
      );
    });

    it('should handle geocoding failure gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      repository.findOne.mockResolvedValue(null);

      const result = await service.captureLocation('user-1', {
        latitude: -6.2088,
        longitude: 106.8456,
      });

      // Should still save with empty city/province
      expect(result.city).toBe('');
      expect(result.province).toBe('');
      expect(repository.save).toHaveBeenCalled();
    });
  });

  describe('saveManualLocation', () => {
    it('should save manual location without coordinates', async () => {
      repository.findOne.mockResolvedValue(null);

      const result = await service.saveManualLocation('user-1', 'Surabaya', 'Jawa Timur');

      expect(result.city).toBe('Surabaya');
      expect(result.province).toBe('Jawa Timur');
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          city: 'Surabaya',
          province: 'Jawa Timur',
          encryptedLatitude: null,
          encryptedLongitude: null,
        }),
      );
    });

    it('should update existing record with manual location', async () => {
      repository.findOne.mockResolvedValue({
        id: 'geo-1',
        userId: 'user-1',
        city: 'Old',
        province: 'Old',
      });

      const result = await service.saveManualLocation('user-1', 'Medan', 'Sumatera Utara');

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          city: 'Medan',
          province: 'Sumatera Utara',
          encryptedLatitude: null,
          encryptedLongitude: null,
        }),
      );
    });
  });

  describe('reverseGeocode', () => {
    it('should return city and province from Nominatim API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          address: { city: 'Yogyakarta', state: 'DI Yogyakarta' },
          display_name: 'Yogyakarta, DI Yogyakarta, Indonesia',
        }),
      });

      const result = await service.reverseGeocode({ latitude: -7.7956, longitude: 110.3695 });

      expect(result.city).toBe('Yogyakarta');
      expect(result.province).toBe('DI Yogyakarta');
    });

    it('should fallback to town/municipality if city not available', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          address: { town: 'Kuta', state: 'Bali' },
        }),
      });

      const result = await service.reverseGeocode({ latitude: -8.7220, longitude: 115.1689 });

      expect(result.city).toBe('Kuta');
      expect(result.province).toBe('Bali');
    });

    it('should return empty values on API error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      const result = await service.reverseGeocode({ latitude: 0, longitude: 0 });

      expect(result.city).toBe('');
      expect(result.province).toBe('');
    });

    it('should return empty values on network failure', async () => {
      mockFetch.mockRejectedValue(new Error('timeout'));

      const result = await service.reverseGeocode({ latitude: 0, longitude: 0 });

      expect(result.city).toBe('');
      expect(result.province).toBe('');
    });
  });

  describe('getRespondentLocation', () => {
    it('should return city and province without coordinates', async () => {
      repository.findOne.mockResolvedValue({
        city: 'Jakarta',
        province: 'DKI Jakarta',
        capturedAt: new Date('2026-01-01'),
      });

      const result = await service.getRespondentLocation('user-1');

      expect(result).toEqual({
        city: 'Jakarta',
        province: 'DKI Jakarta',
        capturedAt: new Date('2026-01-01'),
      });
    });

    it('should return null if no geolocation record exists', async () => {
      repository.findOne.mockResolvedValue(null);

      const result = await service.getRespondentLocation('user-1');

      expect(result).toBeNull();
    });
  });

  describe('getHeatmapData', () => {
    it('should return aggregated location counts', async () => {
      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        addSelect: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        groupBy: vi.fn().mockReturnThis(),
        addGroupBy: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        getRawMany: vi.fn().mockResolvedValue([
          { city: 'Jakarta', province: 'DKI Jakarta', count: '50' },
          { city: 'Bandung', province: 'Jawa Barat', count: '30' },
        ]),
      };
      repository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getHeatmapData();

      expect(result).toEqual([
        { city: 'Jakarta', province: 'DKI Jakarta', count: 50 },
        { city: 'Bandung', province: 'Jawa Barat', count: 30 },
      ]);
    });

    it('should apply city filter', async () => {
      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        addSelect: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        groupBy: vi.fn().mockReturnThis(),
        addGroupBy: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        getRawMany: vi.fn().mockResolvedValue([]),
      };
      repository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await service.getHeatmapData({ city: 'Jakarta' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('geo.city = :city', { city: 'Jakarta' });
    });

    it('should apply province filter', async () => {
      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        addSelect: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        groupBy: vi.fn().mockReturnThis(),
        addGroupBy: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        getRawMany: vi.fn().mockResolvedValue([]),
      };
      repository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await service.getHeatmapData({ province: 'Jawa Barat' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('geo.province = :province', { province: 'Jawa Barat' });
    });
  });

  describe('getDecryptedCoordinates', () => {
    it('should decrypt and return coordinates for data owner', async () => {
      const encLat = encrypt('-6.2088', ENCRYPTION_KEY);
      const encLng = encrypt('106.8456', ENCRYPTION_KEY);

      repository.findOne.mockResolvedValue({
        encryptedLatitude: encLat,
        encryptedLongitude: encLng,
      });

      const result = await service.getDecryptedCoordinates('user-1');

      expect(result).not.toBeNull();
      expect(result!.latitude).toBeCloseTo(-6.2088, 4);
      expect(result!.longitude).toBeCloseTo(106.8456, 4);
    });

    it('should return null if no geolocation record', async () => {
      repository.findOne.mockResolvedValue(null);

      const result = await service.getDecryptedCoordinates('user-1');

      expect(result).toBeNull();
    });

    it('should return null if coordinates are not stored (manual location)', async () => {
      repository.findOne.mockResolvedValue({
        encryptedLatitude: null,
        encryptedLongitude: null,
      });

      const result = await service.getDecryptedCoordinates('user-1');

      expect(result).toBeNull();
    });
  });
});
