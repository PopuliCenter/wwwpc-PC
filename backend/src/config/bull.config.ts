import { registerAs } from '@nestjs/config';

export interface BullConfig {
  redis: {
    host: string;
    port: number;
    password: string | undefined;
    db: number;
  };
}

export const bullConfig = registerAs(
  'bull',
  (): BullConfig => ({
    redis: {
      host: process.env.BULL_REDIS_HOST || 'localhost',
      port: parseInt(process.env.BULL_REDIS_PORT || '6379', 10),
      password: process.env.BULL_REDIS_PASSWORD || undefined,
      db: parseInt(process.env.BULL_REDIS_DB || '1', 10),
    },
  }),
);
