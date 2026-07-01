import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const databaseConfig = registerAs('database', (): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'survei_online',
  synchronize: process.env.DB_SYNCHRONIZE === 'true',
  logging: process.env.DB_LOGGING === 'true',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  autoLoadEntities: true,
  // Connection pooling configuration
  extra: {
    max: parseInt(process.env.DB_POOL_SIZE || '10', 10),
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '30000', 10),
  },
  // Migration configuration
  migrations: ['dist/migrations/*.js'],
  migrationsTableName: 'typeorm_migrations',
  // Auto-run pending migrations on startup in production.
  // In development DB_SYNCHRONIZE=true handles schema, so don't double-run.
  migrationsRun: process.env.NODE_ENV === 'production',
}));
