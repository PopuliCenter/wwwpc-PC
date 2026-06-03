import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { BullModule } from '@nestjs/bull';
import { redisStore } from 'cache-manager-ioredis-yet';
import { databaseConfig } from './database.config';
import { redisConfig } from './redis.config';
import { bullConfig } from './bull.config';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [databaseConfig, redisConfig, bullConfig],
    }),

    // PostgreSQL with TypeORM
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        ...configService.get('database'),
      }),
    }),

    // Redis Cache
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        store: await redisStore({
          host: configService.get<string>('redis.host'),
          port: configService.get<number>('redis.port'),
          password: configService.get<string>('redis.password'),
          db: configService.get<number>('redis.db'),
          keyPrefix: configService.get<string>('redis.keyPrefix'),
        }),
        ttl: (configService.get<number>('redis.cacheTtl') ?? 300) * 1000,
      }),
    }),

    // Bull Queue (Redis-backed)
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get<string>('bull.redis.host'),
          port: configService.get<number>('bull.redis.port'),
          password: configService.get<string>('bull.redis.password'),
          db: configService.get<number>('bull.redis.db'),
        },
      }),
    }),
  ],
  exports: [TypeOrmModule, CacheModule, BullModule],
})
export class DatabaseModule {}
