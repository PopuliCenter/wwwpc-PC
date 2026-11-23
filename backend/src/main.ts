import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { JsonLogger } from './common/logging/json-logger';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { resolveTrustProxyHops } from './common/security/client-ip';
import { buildCorsOptions } from './common/security/cors-options';

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
  // Trust proxy — jumlah hop proxy TEPERCAYA di depan backend (TRUST_PROXY_HOPS).
  // Express lalu mengisi req.ip dengan entri X-Forwarded-For ke-N dari kanan;
  // SEMUA kode membaca IP lewat clientIp(req) (common/security/client-ip.ts),
  // tidak pernah dari XFF paling kiri (bisa dipalsukan klien).
  //
  // Rantai produksi: Cloudflare -> nginx edge -> nginx survei_frontend -> backend.
  //   - Default/kosong = 1: hanya nginx survei_frontend dipercaya. Aman (tidak
  //     bisa dipalsukan) tetapi req.ip = IP container nginx edge untuk semua
  //     pengunjung -> rate-limit per-IP menjadi kuota bersama.
  //   - 2 = nilai produksi yang benar, SETELAH nginx edge memasang
  //     `real_ip_header CF-Connecting-IP` + `set_real_ip_from <rentang Cloudflare>`.
  //     Urutan langkah VPS: docs/ops/vps-multi-app-nginx.md ("IP klien asli").
  //   - Jangan pakai 3: tanpa kunci origin ke IP Cloudflare, IP bisa dipalsukan.
  // ---------------------------------------------------------------------------
  const trustProxyHops = resolveTrustProxyHops(process.env.TRUST_PROXY_HOPS);
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
      hsts: isProduction ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
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

  app.enableCors(buildCorsOptions(allowedOrigins));

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
  // Global exception filter — normalisasi bentuk error & scrub detail 5xx di
  // produksi (cegah kebocoran pesan internal seperti error DB ke klien).
  // ---------------------------------------------------------------------------
  app.useGlobalFilters(new AllExceptionsFilter());

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
