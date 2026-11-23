import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { ClientLogController } from './client-log.controller';
import { ClientLogService, MAX_CONTEXT_CHARS, clientLogRetentionDays } from './client-log.service';

const SECRET = 'unit-test-secret-0123456789-abcdefghij';

describe('audit T-34: log error klien', () => {
  describe('ClientLogController.ingest — identitas dari JWT, bukan body', () => {
    const jwt = new JwtService({ secret: SECRET });
    let service: { record: ReturnType<typeof vi.fn> };
    let ctrl: ClientLogController;

    beforeEach(() => {
      service = { record: vi.fn().mockResolvedValue(undefined) };
      ctrl = new ClientLogController(service as any, jwt);
    });

    const dto = { message: 'boom', userEmail: 'korban@example.com' } as any;

    it('ignores userEmail sent in the body when there is no token', async () => {
      await ctrl.ingest(dto, { headers: {}, ip: '203.0.113.9' } as any);
      expect(service.record).toHaveBeenCalledWith(dto, {
        userId: null,
        userEmail: null,
        ipAddress: '203.0.113.9',
      });
    });

    it('takes userId + email from a valid access token', async () => {
      const token = await jwt.signAsync({ sub: 'u-1', email: 'asli@example.com', type: 'access' });
      await ctrl.ingest(dto, {
        headers: { authorization: `Bearer ${token}` },
        ip: '1.2.3.4',
      } as any);
      expect(service.record.mock.calls[0][1]).toMatchObject({
        userId: 'u-1',
        userEmail: 'asli@example.com',
      });
    });

    it('stores the report anonymously for forged / refresh tokens', async () => {
      const forged = await new JwtService({
        secret: 'other-secret-xxxxxxxxxxxxxxxxxxxxx',
      }).signAsync({
        sub: 'u-2',
        email: 'x@example.com',
      });
      const refresh = await jwt.signAsync({ sub: 'u-3', email: 'y@example.com', type: 'refresh' });
      for (const t of [forged, refresh, 'garbage']) {
        await ctrl.ingest(dto, { headers: { authorization: `Bearer ${t}` }, ip: '1.2.3.4' } as any);
      }
      for (const call of service.record.mock.calls) {
        expect(call[1]).toMatchObject({ userId: null, userEmail: null });
      }
    });
  });

  describe('ClientLogService', () => {
    let repo: any;
    let cronLock: any;
    let service: ClientLogService;

    beforeEach(() => {
      repo = {
        create: vi.fn((x) => x),
        save: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue({ affected: 4 }),
      };
      cronLock = { acquire: vi.fn().mockResolvedValue(true) };
      service = new ClientLogService(repo, cronLock);
    });

    afterEach(() => {
      delete process.env.CLIENT_LOG_RETENTION_DAYS;
    });

    it('caps oversized context', async () => {
      const big = { blob: 'x'.repeat(MAX_CONTEXT_CHARS + 10) };
      await service.record({ message: 'm', context: big } as any, {});
      expect(repo.create.mock.calls[0][0].context).toEqual({
        truncated: true,
        originalLength: JSON.stringify(big).length,
      });
    });

    it('keeps small context as-is and never stores a client-supplied email', async () => {
      await service.record({ message: 'm', context: { a: 1 }, userEmail: 'x@y.z' } as any, {});
      expect(repo.create.mock.calls[0][0]).toMatchObject({ context: { a: 1 }, userEmail: null });
    });

    it('purgeExpired deletes logs older than the retention (default 30 days)', async () => {
      expect(clientLogRetentionDays()).toBe(30);
      process.env.CLIENT_LOG_RETENTION_DAYS = '7';
      const before = Date.now();
      const res = await service.purgeExpired();
      expect(res).toEqual({ deleted: 4 });
      const cutoff: Date = repo.delete.mock.calls[0][0].createdAt.value;
      expect(before - cutoff.getTime()).toBeGreaterThanOrEqual(7 * 86_400_000 - 1000);
      expect(before - cutoff.getTime()).toBeLessThan(7 * 86_400_000 + 1000);
    });

    it('purgeExpired is skipped on replicas without the cron lock', async () => {
      cronLock.acquire.mockResolvedValue(false);
      await service.purgeExpired();
      expect(repo.delete).not.toHaveBeenCalled();
    });
  });
});
