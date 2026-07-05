import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

export interface TestApp {
  app: INestApplication;
  baseUrl: string;
  dataSource: DataSource;
}

/**
 * Bangun skema DB test dengan MENJALANKAN MIGRASI ASLI (bukan synchronize),
 * agar objek yang hanya ada di migrasi (mis. partial unique index untuk
 * ON CONFLICT reward/response) ikut terbentuk — setia dengan produksi.
 * Idempoten: migrasi yang sudah jalan dilewati.
 */
export async function prepareSchema(): Promise<void> {
  // Muat semua kelas migrasi (vitest mentransform .ts via swc).
  const mods = import.meta.glob('../src/migrations/*.ts', { eager: true });
  const migrations = Object.values(mods)
    .flatMap((m) => Object.values(m as Record<string, unknown>))
    .filter((x): x is new () => unknown => typeof x === 'function');

  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    migrations: migrations as any,
    migrationsRun: false,
  });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  await ds.destroy();
}

/**
 * Boot AppModule NYATA (Postgres + Redis via docker-compose.test.yml) dengan
 * setup global yang sama seperti main.ts (ValidationPipe, filter, prefix /api),
 * lalu dengarkan di port acak. Kembalikan baseUrl untuk dipanggil via fetch.
 */
export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.setGlobalPrefix('api', { exclude: ['health'] });

  await app.listen(0); // port acak
  const url = await app.getUrl(); // mis. http://[::1]:PORT
  const baseUrl = url.replace('[::1]', '127.0.0.1').replace('localhost', '127.0.0.1');

  return { app, baseUrl, dataSource: app.get(DataSource) };
}

export interface HttpResponse<T = unknown> {
  status: number;
  body: T;
}

/** Helper fetch JSON dengan opsi token Bearer. */
export async function api<T = unknown>(
  baseUrl: string,
  method: string,
  path: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<HttpResponse<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body: body as T };
}

/** Tunggu kondisi async (mis. poin dikreditkan via event handler). */
export async function waitFor(
  check: () => Promise<boolean>,
  { tries = 20, delayMs = 150 }: { tries?: number; delayMs?: number } = {},
): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}
