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

  it('HttpException tetap memakai statusnya', () => {
    expect(run(new BadRequestException('x')).code).toBe(400);
  });

  it('error tak terduga tetap 500', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(run(new Error('db mati')).code).toBe(500);
  });
});
