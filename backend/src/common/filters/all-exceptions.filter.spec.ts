import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AllExceptionsFilter } from './all-exceptions.filter';

function run(exception: unknown) {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'POST', url: '/x' }),
    }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return { code: status.mock.calls[0]?.[0 as never], body: json.mock.calls[0]?.[0] };
}

describe('AllExceptionsFilter', () => {
  it('error multer dianggap kesalahan klien, apa pun teksnya', () => {
    const err = new Error('Unexpected file field');
    err.name = 'MulterError';
    const { code, body } = run(err);
    expect(code).toBe(400);
    expect(body).toMatchObject({ error: 'Bad Request', message: 'Unexpected file field' });
  });

  it('error http-errors 4xx dari body-parser memakai status aslinya', () => {
    const err = Object.assign(new Error('request entity too large'), {
      status: 413,
      statusCode: 413,
      expose: true,
    });
    const { code, body } = run(err);
    expect(code).toBe(413);
    expect(body).toMatchObject({
      statusCode: 413,
      error: 'Payload Too Large',
      message: 'Data yang dikirim terlalu besar.',
    });
  });

  it('pesan asli body-parser tidak diteruskan ke klien', () => {
    const err = Object.assign(new Error('incorrect header check'), { status: 400, expose: true });
    const { code, body } = run(err);
    expect(code).toBe(400);
    expect(body).toMatchObject({ error: 'Bad Request', message: 'Permintaan tidak valid.' });
  });

  it('error berstatus 4xx tanpa expose tetap 500, mis. dari layanan luar', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const err = Object.assign(new Error('token upstream ditolak'), { status: 401 });
    expect(run(err).code).toBe(500);
  });

  it('error berstatus 5xx walau expose tetap 500', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const err = Object.assign(new Error('rahasia'), { status: 503, expose: true });
    expect(run(err).code).toBe(500);
  });

  it('HttpException tetap memakai statusnya', () => {
    expect(run(new BadRequestException('x')).code).toBe(400);
  });

  it('error tak terduga tetap 500', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(run(new Error('db mati')).code).toBe(500);
  });
});
