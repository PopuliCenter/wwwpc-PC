import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { JsonLogger } from './common/logging/json-logger';

async function bootstrap() {
  // Use structured JSON logger from the start so bootstrap errors are also captured
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new JsonLogger(),
    bufferLogs: true, // buffer logs until the custom logger is flushed
  });

  // Flush buffered logs through our custom logger
  app.useLogger(new JsonLogger());

  const isProduction = process.env.NODE_ENV === 'production';

  // ---------------------------------------------------------------------------
  // Trust proxy — we sit behind Cloudflare + Nginx in production.
  // This makes req.ip / X-Forwarded-For resolve to the real client IP so that
  // rate limiting and audit logging record the correct address.
  // The value is the number of trusted proxy hops (Nginx = 1). Cloudflare's
  // CF-Connecting-IP is restored to X-Forwarded-For by Nginx config.
  // ---------------------------------------------------------------------------
  const trustProxyHops = parseInt(process.env.TRUST_PROXY_HOPS ?? '1', 10);
  app.set('trust proxy', trustProxyHops);

  // ---------------------------------------------------------------------------
  // Security headers via Helmet.
  // Removes X-Powered-By, sets HSTS, X-Content-Type-Options, Referrer-Policy, etc.
  // CSP is left to Nginx/Cloudflare for the frontend; the API only serves JSON,
  // so we disable CSP here and keep cross-origin resource policy permissive for
  // the SPA on a different origin.
  // ---------------------------------------------------------------------------
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      hsts: isProduction
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
    }),
  );
  app.disable('x-powered-by');

  // ---------------------------------------------------------------------------
  // CORS — whitelist origins from environment variable
  // ---------------------------------------------------------------------------
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. server-to-server, curl, mobile apps).
      // In production this is restricted to avoid abuse from non-browser clients.
      if (!origin) {
        if (isProduction) {
          return callback(new Error('Origin header is required'));
        }
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error(`Origin '${origin}' not allowed by CORS policy`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // ---------------------------------------------------------------------------
  // Global validation pipe
  // whitelist:           strips properties not declared in the DTO
  // forbidNonWhitelisted: 400 on any extra property
  // transform:           auto-coerce plain objects to DTO class instances
  // ---------------------------------------------------------------------------
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ---------------------------------------------------------------------------
  // Global route prefix — all API routes are under /api
  // The /health endpoint is excluded so Docker / LB probes keep working.
  // ---------------------------------------------------------------------------
  app.setGlobalPrefix('api', {
    exclude: ['health'],
  });

  // ---------------------------------------------------------------------------
  // Graceful shutdown — let in-flight requests finish and close DB/Redis/queue
  // connections cleanly when the container receives SIGTERM/SIGINT.
  // ---------------------------------------------------------------------------
  app.enableShutdownHooks();

  const logger = new Logger('Bootstrap');
  const port = process.env.PORT ?? '3000';
  await app.listen(port);
  logger.log(`Application is running on port ${port}`);

  const shutdown = async (signal: string) => {
    logger.log(`Received ${signal}, shutting down gracefully...`);
    try {
      await app.close();
      logger.log('Application closed cleanly');
      process.exit(0);
    } catch (err) {
      logger.error(`Error during shutdown: ${(err as Error).message}`);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap();
