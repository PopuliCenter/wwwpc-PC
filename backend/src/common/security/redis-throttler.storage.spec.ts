import { describe, it, expect, vi } from 'vitest';
import { RedisThrottlerStorage } from './redis-throttler.storage';

function fakeClient(evalImpl: (...args: unknown[]) => unknown) {
  return {
    on: vi.fn(),
    eval: vi.fn(evalImpl),
    quit: vi.fn().mockResolvedValue('OK'),
    disconnect: vi.fn(),
  };
}

describe('RedisThrottlerStorage', () => {
  it('maps the Lua result to a ThrottlerStorageRecord (times in seconds)', async () => {
    const client = fakeClient(async () => [3, 42_100, 0, 0]);
    const storage = new RedisThrottlerStorage(client as never);
    const rec = await storage.increment('k', 60_000, 5, 0, 'default');
    expect(rec).toEqual({ totalHits: 3, timeToExpire: 43, isBlocked: false, timeToBlockExpire: 0 });
    // Kunci per throttler + blockDuration 0 → pakai ttl.
    expect(client.eval).toHaveBeenCalledWith(
      expect.any(String),
      2,
      'throttle:default:k:hits',
      'throttle:default:k:block',
      '60000',
      '5',
      '60000',
    );
  });

  it('reports a block returned by Redis', async () => {
    const client = fakeClient(async () => [6, 1_000, 1, 59_500]);
    const storage = new RedisThrottlerStorage(client as never);
    const rec = await storage.increment('k', 60_000, 5, 60_000, 'default');
    expect(rec.isBlocked).toBe(true);
    expect(rec.timeToBlockExpire).toBe(60);
  });

  it('falls back to in-memory counting when Redis fails (still limits)', async () => {
    const client = fakeClient(async () => {
      throw new Error('Connection is closed.');
    });
    const storage = new RedisThrottlerStorage(client as never);
    let last;
    for (let i = 0; i < 3; i++) last = await storage.increment('k', 60_000, 2, 60_000, 'default');
    expect(last!.totalHits).toBe(3);
    expect(last!.isBlocked).toBe(true);
    await storage.onModuleDestroy();
  });
});
