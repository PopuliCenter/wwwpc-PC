import { describe, it, expect, vi } from 'vitest';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

const makeCtx = () =>
  ({
    getHandler: () => () => undefined,
    getClass: () => class {},
  }) as unknown as ExecutionContext;

describe('JwtAuthGuard', () => {
  it('route @Public dilewati: canActivate = true tanpa memanggil passport', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(true),
    } as unknown as Reflector;
    const guard = new JwtAuthGuard(reflector);

    // Bila @Public terdeteksi, guard SHORT-CIRCUIT ke true tanpa menjalankan
    // autentikasi passport (yang butuh request valid). Ini perilaku inti yg dijaga.
    expect(guard.canActivate(makeCtx())).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith('isPublic', expect.any(Array));
  });

  it('membaca metadata dari handler & class (getAllAndOverride override handler>class)', () => {
    const getAllAndOverride = vi.fn().mockReturnValue(true);
    const reflector = { getAllAndOverride } as unknown as Reflector;
    const guard = new JwtAuthGuard(reflector);

    guard.canActivate(makeCtx());
    // Argumen kedua = [handler, class] agar @Public di route ATAU controller berlaku.
    const targets = getAllAndOverride.mock.calls[0][1];
    expect(Array.isArray(targets)).toBe(true);
    expect(targets).toHaveLength(2);
  });
});
