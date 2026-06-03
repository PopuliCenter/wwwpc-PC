import { registerAs } from '@nestjs/config';

export interface AuthConfig {
  jwtSecret: string;
  jwtAccessExpiresIn: string;
  jwtRefreshExpiresIn: string;
  sessionTtl: number; // seconds
}

export const authConfig = registerAs(
  'auth',
  (): AuthConfig => {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error(
        'JWT_SECRET environment variable is not set. ' +
          'Set a strong random secret before starting the application.',
      );
    }

    return {
      jwtSecret,
      jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
      jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
      sessionTtl: parseInt(process.env.SESSION_TTL || '604800', 10), // 7 days in seconds
    };
  },
);
