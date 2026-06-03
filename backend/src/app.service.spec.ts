import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { AppService } from './app.service';

describe('AppService', () => {
  const appService = new AppService();

  describe('getHealth', () => {
    it('should always return ok status', () => {
      const result = appService.getHealth();
      expect(result.status).toBe('ok');
    });

    it('should return valid ISO timestamp (property-based)', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const result = appService.getHealth();
          const timestamp = new Date(result.timestamp);
          expect(timestamp.toISOString()).toBe(result.timestamp);
        }),
      );
    });
  });
});
