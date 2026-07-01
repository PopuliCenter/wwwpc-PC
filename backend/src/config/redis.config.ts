import { registerAs } from '@nestjs/config';

export interface RedisConfig {
  host: string;
  port: number;
  password: string | undefined;
  db: number;
  keyPrefix: string;
  cacheTtl: number;
}

export const redisConfig = registerAs('redis', (): RedisConfig => ({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  keyPrefix: process.env.REDIS_KEY_PREFIX || 'survei:',
  cacheTtl: parseInt(process.env.REDIS_CACHE_TTL || '300', 10),
}));
