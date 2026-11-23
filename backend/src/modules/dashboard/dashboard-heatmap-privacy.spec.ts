import { describe, it, expect, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { coarsenHeatmap } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { GeolocationController } from '../geolocation/geolocation.controller';
import { ROLES_KEY } from '@modules/auth/decorators';
import { UserRole } from '@shared/enums';

const detailed = [
  {
    latitude: -6.2001,
    longitude: 106.8166,
    count: 2,
    city: 'Jakarta',
    respondents: [
      { name: 'Budi', submittedAt: null, province: 'DKI', city: 'Jakarta', district: 'Menteng' },
    ],
  },
  { latitude: -6.2004, longitude: 106.8169, count: 3, city: undefined, respondents: [] },
  { latitude: -7.25, longitude: 112.75, count: 1, city: 'Surabaya', respondents: [] },
];

describe('audit T-33: peta dashboard untuk VIEWER', () => {
  it('coarsenHeatmap rounds to 2 decimals, merges counts and drops respondent details', () => {
    const out = coarsenHeatmap(detailed as any);
    expect(out).toEqual([
      { latitude: -6.2, longitude: 106.82, count: 5, city: 'Jakarta' },
      { latitude: -7.25, longitude: 112.75, count: 1, city: 'Surabaya' },
    ]);
    expect(JSON.stringify(out)).not.toContain('Budi');
  });

  it('VIEWER gets the coarse version, ANALYST the detailed one', async () => {
    const service = {
      getHeatmapData: vi.fn().mockResolvedValue(detailed),
      getCoarseHeatmapData: vi.fn().mockResolvedValue([]),
    };
    const ctrl = new DashboardController(service as any);

    await ctrl.getHeatmapData({ user: { role: UserRole.VIEWER } } as any);
    expect(service.getCoarseHeatmapData).toHaveBeenCalledTimes(1);
    expect(service.getHeatmapData).not.toHaveBeenCalled();

    await ctrl.getHeatmapData({ user: { role: UserRole.ANALYST } } as any);
    expect(service.getHeatmapData).toHaveBeenCalledTimes(1);
  });
});

describe('audit T-45: GET /geolocation/heatmap khusus peran analitik', () => {
  it('declares SUPER_ADMIN/ADMIN/ANALYST only (respondent & viewer excluded)', () => {
    const roles = new Reflector().get<UserRole[]>(
      ROLES_KEY,
      GeolocationController.prototype.getHeatmapData,
    );
    expect(roles).toEqual([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ANALYST]);
  });
});
