import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { buildCorsOptions } from './cors-options';

@Controller('ping')
class PingController {
  @Get()
  ping() {
    return { ok: true };
  }
}

describe('CORS (audit T-38)', () => {
  let app: INestApplication;
  let base: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ controllers: [PingController] }).compile();
    app = mod.createNestApplication({ logger: false });
    app.enableCors(buildCorsOptions(['https://survei.example.org']));
    await app.listen(0, '127.0.0.1');
    base = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  });

  afterAll(async () => {
    await app?.close();
  });

  const preflight = (origin: string) =>
    fetch(`${base}/ping`, {
      method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' },
    });

  it('foreign origin: no 500, and no Access-Control-Allow-Origin header', async () => {
    const res = await preflight('https://evil.example');
    expect(res.status).toBeLessThan(500);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();

    const get = await fetch(`${base}/ping`, { headers: { Origin: 'https://evil.example' } });
    expect(get.status).toBe(200); // server tetap menjawab; browser yang memblokir
    expect(get.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('allowed origin gets the CORS headers', async () => {
    const res = await preflight('https://survei.example.org');
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://survei.example.org');
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('requests without Origin (same-origin proxy, healthcheck, native) are allowed', async () => {
    const res = await fetch(`${base}/ping`);
    expect(res.status).toBe(200);
  });
});
