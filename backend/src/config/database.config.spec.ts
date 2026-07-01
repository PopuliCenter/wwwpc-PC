import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { databaseConfig } from './database.config';

describe('databaseConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return default values when no env vars are set', () => {
    delete process.env.DB_HOST;
    delete process.env.DB_PORT;
    delete process.env.DB_USERNAME;
    delete process.env.DB_PASSWORD;
    delete process.env.DB_DATABASE;
    delete process.env.DB_SYNCHRONIZE;
    delete process.env.DB_LOGGING;
    delete process.env.DB_SSL;
    delete process.env.DB_POOL_SIZE;
    delete process.env.DB_CONNECTION_TIMEOUT;

    const config = databaseConfig() as Record<string, unknown>;

    expect(config.type).toBe('postgres');
    expect(config.host).toBe('localhost');
    expect(config.port).toBe(5432);
    expect(config.username).toBe('postgres');
    expect(config.password).toBe('postgres');
    expect(config.database).toBe('survei_online');
    expect(config.synchronize).toBe(false);
    expect(config.logging).toBe(false);
    expect(config.ssl).toBe(false);
    expect(config.autoLoadEntities).toBe(true);
    expect((config.extra as Record<string, unknown>).max).toBe(10);
    expect((config.extra as Record<string, unknown>).connectionTimeoutMillis).toBe(30000);
  });

  it('should read values from environment variables', () => {
    process.env.DB_HOST = 'db.example.com';
    process.env.DB_PORT = '5433';
    process.env.DB_USERNAME = 'admin';
    process.env.DB_PASSWORD = 'secret123';
    process.env.DB_DATABASE = 'test_db';
    process.env.DB_SYNCHRONIZE = 'true';
    process.env.DB_LOGGING = 'true';
    process.env.DB_SSL = 'true';
    process.env.DB_POOL_SIZE = '20';
    process.env.DB_CONNECTION_TIMEOUT = '60000';

    const config = databaseConfig() as Record<string, unknown>;

    expect(config.host).toBe('db.example.com');
    expect(config.port).toBe(5433);
    expect(config.username).toBe('admin');
    expect(config.password).toBe('secret123');
    expect(config.database).toBe('test_db');
    expect(config.synchronize).toBe(true);
    expect(config.logging).toBe(true);
    expect(config.ssl).toEqual({ rejectUnauthorized: false });
    expect((config.extra as Record<string, unknown>).max).toBe(20);
    expect((config.extra as Record<string, unknown>).connectionTimeoutMillis).toBe(60000);
  });

  it('should configure migrations correctly', () => {
    const config = databaseConfig() as Record<string, unknown>;

    expect(config.migrations).toEqual(['dist/migrations/*.js']);
    expect(config.migrationsTableName).toBe('typeorm_migrations');
  });
});
