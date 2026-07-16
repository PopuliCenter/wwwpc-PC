import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const databaseConfig = registerAs('database', (): TypeOrmModuleOptions => {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'survei_online',
    // 12-factor X (dev/prod parity): di PRODUKSI skema HANYA lewat migrasi —
    // synchronize dipaksa false apa pun isi DB_SYNCHRONIZE, agar tak ada kemungkinan
    // TypeORM diam-diam mengubah skema produksi (bisa drop kolom/data). Di dev,
    // synchronize opsional (cepat saat prototipe) — TAPI setiap perubahan entity
    // yang akan di-deploy WAJIB dibuatkan migrasi (npm run migration:generate).
    synchronize: !isProd && process.env.DB_SYNCHRONIZE === 'true',
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
    migrationsRun: isProd,
  };
});
