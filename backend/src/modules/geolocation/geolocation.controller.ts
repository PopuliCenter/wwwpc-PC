import { AuthenticatedRequest } from '@modules/auth/interfaces';
import { Controller, Post, Get, Body, UseGuards, Request, Query } from '@nestjs/common';
import { JwtAuthGuard } from '@modules/auth/guards';
import { GeolocationService } from './geolocation.service';
import { CaptureLocationDto, ManualLocationDto } from './dto';
import { GeoFilter, HeatmapPoint, LocationData, CaptureLocationResult } from './interfaces';

@Controller('geolocation')
@UseGuards(JwtAuthGuard)
export class GeolocationController {
  constructor(private readonly geolocationService: GeolocationService) {}

  /**
   * Capture location from GPS coordinates.
   * Performs reverse geocoding and stores encrypted coordinates.
   */
  @Post('capture')
  async captureLocation(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CaptureLocationDto,
  ): Promise<CaptureLocationResult> {
    return this.geolocationService.captureLocation(req.user.userId, {
      latitude: dto.latitude,
      longitude: dto.longitude,
    });
  }

  /**
   * Save manual location when user denies GPS permission.
   */
  @Post('manual')
  async saveManualLocation(
    @Request() req: AuthenticatedRequest,
    @Body() dto: ManualLocationDto,
  ): Promise<CaptureLocationResult> {
    return this.geolocationService.saveManualLocation(req.user.userId, dto.city, dto.province);
  }

  /**
   * Get current user's location data (city/province only).
   * Never returns raw GPS coordinates.
   */
  @Get('me')
  async getMyLocation(@Request() req: AuthenticatedRequest): Promise<LocationData | null> {
    return this.geolocationService.getRespondentLocation(req.user.userId);
  }

  /**
   * Get heatmap data for geographic distribution visualization.
   * Returns aggregated data (city/province + count), never raw coordinates.
   */
  @Get('heatmap')
  async getHeatmapData(
    @Query('city') city?: string,
    @Query('province') province?: string,
  ): Promise<HeatmapPoint[]> {
    const filters: GeoFilter = {};
    if (city) filters.city = city;
    if (province) filters.province = province;
    return this.geolocationService.getHeatmapData(filters);
  }
}
