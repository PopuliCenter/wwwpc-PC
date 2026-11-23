import { Logger, OnModuleDestroy } from '@nestjs/common';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import Redis from 'ioredis';

/**
 * Penyimpanan counter rate-limit di Redis agar kuota berlaku LINTAS REPLIKA
 * (T-07). Tanpa ini setiap replika punya Map in-memory sendiri, sehingga
 * "5 login/menit" menjadi 5 x jumlah replika.
 *
 * Algoritma: fixed window (sama dgn storage bawaan @nestjs/throttler) + blokir
 * selama `blockDuration` setelah batas terlampaui, dijalankan atomik via Lua.
 *
 * Redis bermasalah -> fallback ke storage in-memory bawaan (FAIL-SOFT):
 * rate-limit per replika tetap berjalan, API tidak ikut mati karena Redis.
 */
const SCRIPT = `
local hitsKey = KEYS[1]
local blockKey = KEYS[2]
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockDuration = tonumber(ARGV[3])

local blockTtl = redis.call('PTTL', blockKey)
if blockTtl > 0 then
  local hitsTtl = redis.call('PTTL', hitsKey)
  if hitsTtl < 0 then hitsTtl = 0 end
  return {limit + 1, hitsTtl, 1, blockTtl}
end

local hits = redis.call('INCR', hitsKey)
local hitsTtl = redis.call('PTTL', hitsKey)
if hitsTtl < 0 then
  redis.call('PEXPIRE', hitsKey, ttl)
  hitsTtl = ttl
end

if hits > limit then
  redis.call('SET', blockKey, '1', 'PX', blockDuration)
  redis.call('DEL', hitsKey)
  return {hits, hitsTtl, 1, blockDuration}
end
return {hits, hitsTtl, 0, 0}
`;

export interface RedisThrottlerOptions {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
}

export class RedisThrottlerStorage implements ThrottlerStorage, OnModuleDestroy {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly fallback = new ThrottlerStorageService();
  private lastWarnAt = 0;

  constructor(private readonly client: Redis) {
    this.client.on('error', () => {
      /* dicatat per-increment (dibatasi); cegah unhandled error event */
    });
  }

  static fromOptions(opts: RedisThrottlerOptions): RedisThrottlerStorage {
    const client = new Redis({
      host: opts.host,
      port: opts.port,
      password: opts.password,
      db: opts.db,
      keyPrefix: opts.keyPrefix,
      // Gagal cepat saat Redis down -> langsung fallback in-memory, tidak
      // menahan request menunggu antrean offline.
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    client.connect().catch(() => {
      /* koneksi dicoba ulang otomatis oleh ioredis; fallback aktif sementara */
    });
    return new RedisThrottlerStorage(client);
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const base = `throttle:${throttlerName}:${key}`;
    const block = blockDuration > 0 ? blockDuration : ttl;
    try {
      const res = (await this.client.eval(
        SCRIPT,
        2,
        `${base}:hits`,
        `${base}:block`,
        String(ttl),
        String(limit),
        String(block),
      )) as [number, number, number, number];
      const [totalHits, hitsTtlMs, blocked, blockTtlMs] = res.map(Number);
      return {
        totalHits,
        // Kontrak storage bawaan: waktu dalam DETIK (dibulatkan ke atas).
        timeToExpire: Math.ceil(hitsTtlMs / 1000),
        isBlocked: blocked === 1,
        timeToBlockExpire: Math.ceil(blockTtlMs / 1000),
      };
    } catch (err) {
      const now = Date.now();
      if (now - this.lastWarnAt > 60_000) {
        this.lastWarnAt = now;
        this.logger.warn(
          `Redis throttler tidak tersedia, pakai counter in-memory sementara: ${(err as Error).message}`,
        );
      }
      return this.fallback.increment(key, ttl, limit, blockDuration, throttlerName);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.fallback.onApplicationShutdown();
    await this.client.quit().catch(() => this.client.disconnect());
  }
}
