import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Geolocation } from './entities/geolocation.entity';
import {
  Coordinates,
  GeocodedAddress,
  LocationData,
  HeatmapPoint,
  GeoFilter,
  CaptureLocationResult,
} from './interfaces';
import { encrypt, decrypt } from './utils';
import { CircuitBreaker } from '@shared/circuit-breaker';

@Injectable()
export class GeolocationService {
  private readonly logger = new Logger(GeolocationService.name);
  private readonly encryptionKey: string;
  private readonly geocodingCircuitBreaker: CircuitBreaker;

  constructor(
    @InjectRepository(Geolocation)
    private readonly geolocationRepository: Repository<Geolocation>,
    private readonly configService: ConfigService,
  ) {
    const geoKey = this.configService.get<string>('GEO_ENCRYPTION_KEY');
    if (!geoKey) {
      throw new Error(
        'GEO_ENCRYPTION_KEY environment variable is not set. ' +
          'Set a strong random 32-byte key before starting the application.',
      );
    }
    this.encryptionKey = geoKey;
    this.geocodingCircuitBreaker = new CircuitBreaker({
      name: 'geocoding-api',
      failureThreshold: 5,
      successThreshold: 3,
      timeout: 30000,
    });
  }

  /**
   * Capture location from GPS coordinates, perform reverse geocoding,
   * encrypt coordinates, and store.
   */
  async captureLocation(userId: string, coords: Coordinates): Promise<CaptureLocationResult> {
    this.logger.log(`Capturing location for user ${userId}: lat=${coords.latitude}, lng=${coords.longitude}`);

    // Reverse geocode to get city/province
    const geocoded = await this.reverseGeocode(coords);

    // Encrypt coordinates before storage
    const encryptedLatitude = encrypt(coords.latitude.toString(), this.encryptionKey);
    const encryptedLongitude = encrypt(coords.longitude.toString(), this.encryptionKey);

    // Check if user already has a geolocation record
    let geolocation = await this.geolocationRepository.findOne({
      where: { userId },
    });

    if (geolocation) {
      // Update existing record
      geolocation.encryptedLatitude = encryptedLatitude;
      geolocation.encryptedLongitude = encryptedLongitude;
      geolocation.city = geocoded.city;
      geolocation.province = geocoded.province;
      geolocation.capturedAt = new Date();
    } else {
      // Create new record
      geolocation = this.geolocationRepository.create({
        userId,
        encryptedLatitude,
        encryptedLongitude,
        city: geocoded.city,
        province: geocoded.province,
        capturedAt: new Date(),
      });
    }

    const saved = await this.geolocationRepository.save(geolocation);

    return {
      id: saved.id,
      city: saved.city ?? '',
      province: saved.province ?? '',
      capturedAt: saved.capturedAt,
    };
  }

  /**
   * Save manual location input (when user denies GPS permission).
   */
  async saveManualLocation(userId: string, city: string, province: string): Promise<CaptureLocationResult> {
    this.logger.log(`Saving manual location for user ${userId}: ${city}, ${province}`);

    let geolocation = await this.geolocationRepository.findOne({
      where: { userId },
    });

    if (geolocation) {
      geolocation.city = city;
      geolocation.province = province;
      geolocation.encryptedLatitude = null;
      geolocation.encryptedLongitude = null;
      geolocation.capturedAt = new Date();
    } else {
      geolocation = this.geolocationRepository.create({
        userId,
        city,
        province,
        encryptedLatitude: null,
        encryptedLongitude: null,
        capturedAt: new Date(),
      });
    }

    const saved = await this.geolocationRepository.save(geolocation);

    return {
      id: saved.id,
      city: saved.city ?? '',
      province: saved.province ?? '',
      capturedAt: saved.capturedAt,
    };
  }

  /**
   * Reverse geocode coordinates to get city and province.
   * Uses Nominatim API (OpenStreetMap) as the geocoding provider.
   * Falls back to empty values if geocoding fails or circuit breaker is open.
   */
  async reverseGeocode(coords: Coordinates): Promise<GeocodedAddress> {
    const fallback: GeocodedAddress = { city: '', province: '' };

    return this.geocodingCircuitBreaker.execute<GeocodedAddress>(
      async () => {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.latitude}&lon=${coords.longitude}&zoom=10&addressdetails=1`;

        const response = await fetch(url, {
          headers: {
            'User-Agent': 'SurveyOnlineSystem/1.0',
            'Accept-Language': 'id',
          },
        });

        if (!response.ok) {
          throw new Error(`Geocoding API returned ${response.status}`);
        }

        const data: any = await response.json();
        const address = data.address || {};

        return {
          city: address.city || address.town || address.municipality || address.county || '',
          province: address.state || address.province || '',
          displayName: data.display_name || '',
        };
      },
      fallback,
    );
  }

  /**
   * Get respondent's location data (city/province only - never raw GPS).
   */
  async getRespondentLocation(userId: string): Promise<LocationData | null> {
    const geolocation = await this.geolocationRepository.findOne({
      where: { userId },
    });

    if (!geolocation) {
      return null;
    }

    return {
      city: geolocation.city ?? '',
      province: geolocation.province ?? '',
      capturedAt: geolocation.capturedAt,
    };
  }

  /**
   * Get heatmap data - aggregated counts by city/province.
   * Never returns raw GPS coordinates.
   */
  async getHeatmapData(filters?: GeoFilter): Promise<HeatmapPoint[]> {
    const queryBuilder = this.geolocationRepository
      .createQueryBuilder('geo')
      .select('geo.city', 'city')
      .addSelect('geo.province', 'province')
      .addSelect('COUNT(*)', 'count')
      .where('geo.city IS NOT NULL')
      .andWhere('geo.province IS NOT NULL')
      .groupBy('geo.city')
      .addGroupBy('geo.province')
      .orderBy('count', 'DESC');

    if (filters?.city) {
      queryBuilder.andWhere('geo.city = :city', { city: filters.city });
    }

    if (filters?.province) {
      queryBuilder.andWhere('geo.province = :province', { province: filters.province });
    }

    const results = await queryBuilder.getRawMany();

    return results.map((row) => ({
      city: row.city,
      province: row.province,
      count: parseInt(row.count, 10),
    }));
  }

  /**
   * Decrypt stored coordinates for the data owner only.
   * This should NEVER be exposed to other users via API.
   * Used internally for data export or owner's own view.
   */
  async getDecryptedCoordinates(userId: string): Promise<Coordinates | null> {
    const geolocation = await this.geolocationRepository.findOne({
      where: { userId },
    });

    if (!geolocation || !geolocation.encryptedLatitude || !geolocation.encryptedLongitude) {
      return null;
    }

    try {
      const latitude = parseFloat(decrypt(geolocation.encryptedLatitude, this.encryptionKey));
      const longitude = parseFloat(decrypt(geolocation.encryptedLongitude, this.encryptionKey));
      return { latitude, longitude };
    } catch (error: any) {
      this.logger.error(`Failed to decrypt coordinates for user ${userId}: ${error.message}`);
      return null;
    }
  }
}
