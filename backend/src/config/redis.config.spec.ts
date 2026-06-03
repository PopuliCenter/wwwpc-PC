import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { redisConfig } from './redis.config';

describe('redisConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return default values when no env vars are set', () => {
    delete process.env.REDIS_HOST;
    delete process.env.REDIS_PORT;
    delete process.env.REDIS_PASSWORD;
    delete process.env.REDIS_DB;
    delete process.env.REDIS_KEY_PREFIX;
    delete process.env.REDIS_CACHE_TTL;

    const config = redisConfig();

    expect(config.host).toBe('localhost');
    expect(config.port).toBe(6379);
    expect(config.password).toBeUndefined();
    expect(config.db).toBe(0);
    expect(config.keyPrefix).toBe('survei:');
    expect(config.cacheTtl).toBe(300);
  });

  it('should read values from environment variables', () => {
    process.env.REDIS_HOST = 'redis.example.com';
    process.env.REDIS_PORT = '6380';
    process.env.REDIS_PASSWORD = 'redis_secret';
    process.env.REDIS_DB = '2';
    process.env.REDIS_KEY_PREFIX = 'app:';
    process.env.REDIS_CACHE_TTL = '600';

    const config = redisConfig();

    expect(config.host).toBe('redis.example.com');
    expect(config.port).toBe(6380);
    expect(config.password).toBe('redis_secret');
    expect(config.db).toBe(2);
    expect(config.keyPrefix).toBe('app:');
    expect(config.cacheTtl).toBe(600);
  });
});
