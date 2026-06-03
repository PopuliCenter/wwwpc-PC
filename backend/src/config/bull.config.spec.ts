import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { bullConfig } from './bull.config';

describe('bullConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return default values when no env vars are set', () => {
    delete process.env.BULL_REDIS_HOST;
    delete process.env.BULL_REDIS_PORT;
    delete process.env.BULL_REDIS_PASSWORD;
    delete process.env.BULL_REDIS_DB;

    const config = bullConfig();

    expect(config.redis.host).toBe('localhost');
    expect(config.redis.port).toBe(6379);
    expect(config.redis.password).toBeUndefined();
    expect(config.redis.db).toBe(1);
  });

  it('should read values from environment variables', () => {
    process.env.BULL_REDIS_HOST = 'bull-redis.example.com';
    process.env.BULL_REDIS_PORT = '6381';
    process.env.BULL_REDIS_PASSWORD = 'bull_secret';
    process.env.BULL_REDIS_DB = '3';

    const config = bullConfig();

    expect(config.redis.host).toBe('bull-redis.example.com');
    expect(config.redis.port).toBe(6381);
    expect(config.redis.password).toBe('bull_secret');
    expect(config.redis.db).toBe(3);
  });
});
