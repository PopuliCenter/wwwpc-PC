import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { DeviceTokenService } from './device-token.service';
import { NotificationFeedService } from './notification-feed.service';
import { AuditService } from '@modules/audit/audit.service';
import { JwtAuthGuard } from '@modules/auth/guards';
import { UserRole, AuditActionType } from '@shared/enums';

const TARGET_USER = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

/**
 * Pengganti JwtAuthGuard: isi req.user dari header uji (tanpa JWT/Passport).
 * RolesGuard dan ValidationPipe tetap yang ASLI, jadi 403/400 di sini nyata.
 */
const fakeJwtGuard: CanActivate = {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const role = req.headers['x-test-role'];
    if (!role) return false;
    req.user = { userId: 'actor-1', email: 'actor@x.com', role, sessionId: 's-1' };
    return true;
  },
};

describe('NotificationController (HTTP)', () => {
  let app: INestApplication;
  let baseUrl: string;
  const deviceTokenService = {
    register: vi.fn(),
    sendTestPush: vi.fn(),
  };
  const feedService = {
    getFeed: vi.fn(),
    unreadCount: vi.fn(),
    markRead: vi.fn(),
    clearAll: vi.fn(),
    deleteOne: vi.fn(),
  };
  const auditService = { log: vi.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [NotificationController],
      providers: [
        { provide: DeviceTokenService, useValue: deviceTokenService },
        { provide: NotificationFeedService, useValue: feedService },
        { provide: AuditService, useValue: auditService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(fakeJwtGuard)
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    // Sama dengan main.ts.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.listen(0, '127.0.0.1');
    baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    deviceTokenService.sendTestPush.mockResolvedValue({ pushEnabled: true, devices: 2, pushed: 2 });
    auditService.log.mockResolvedValue(undefined);
    feedService.unreadCount.mockResolvedValue(4);
  });

  const post = (path: string, role: UserRole | null, body: unknown) =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(role ? { 'x-test-role': role } : {}),
      },
      body: JSON.stringify(body),
    });

  describe('POST /notifications/test-push', () => {
    it.each([UserRole.ADMIN, UserRole.SUPER_ADMIN])(
      '%s gets 200 with { pushEnabled, devices, pushed }',
      async (role) => {
        const res = await post('/notifications/test-push', role, { userId: TARGET_USER });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ pushEnabled: true, devices: 2, pushed: 2 });
        expect(deviceTokenService.sendTestPush).toHaveBeenCalledWith(TARGET_USER);
      },
    );

    it('writes an audit log entry naming the target user', async () => {
      await post('/notifications/test-push', UserRole.ADMIN, { userId: TARGET_USER });

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'actor-1',
          actionType: AuditActionType.NOTIFICATION_SENT,
          module: 'notification',
          details: expect.objectContaining({ kind: 'test_push', targetUserId: TARGET_USER }),
        }),
      );
    });

    it('passes through pushEnabled=false when push is off on the server', async () => {
      deviceTokenService.sendTestPush.mockResolvedValue({
        pushEnabled: false,
        devices: 1,
        pushed: 0,
      });

      const res = await post('/notifications/test-push', UserRole.ADMIN, { userId: TARGET_USER });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ pushEnabled: false, devices: 1, pushed: 0 });
    });

    it.each([UserRole.RESPONDENT, UserRole.VIEWER])('%s gets 403', async (role) => {
      const res = await post('/notifications/test-push', role, { userId: TARGET_USER });

      expect(res.status).toBe(403);
      expect(deviceTokenService.sendTestPush).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown user (no audit entry)', async () => {
      deviceTokenService.sendTestPush.mockRejectedValue(new NotFoundException('tidak ada'));

      const res = await post('/notifications/test-push', UserRole.ADMIN, { userId: TARGET_USER });

      expect(res.status).toBe(404);
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it.each([{ userId: 'bukan-uuid' }, {}, { userId: TARGET_USER, extra: 1 }])(
      'returns 400 for an invalid body %j',
      async (body) => {
        const res = await post('/notifications/test-push', UserRole.ADMIN, body);

        expect(res.status).toBe(400);
        expect(deviceTokenService.sendTestPush).not.toHaveBeenCalled();
      },
    );
  });

  it('other notification routes stay open to respondents', async () => {
    const res = await fetch(`${baseUrl}/notifications/feed/unread-count`, {
      headers: { 'x-test-role': UserRole.RESPONDENT },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 4 });
  });
});
