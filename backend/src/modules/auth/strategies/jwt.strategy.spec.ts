import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { UserStatus } from '../entities';
import { UserRole } from '@shared/enums';
import { JwtPayload } from '../interfaces';

/**
 * Audit 23 Nov 2026 — T-05 (peran tidak dipercaya dari token) & T-11 (pencabutan
 * sesi ditegakkan di setiap request).
 */
describe('JwtStrategy.validate', () => {
  let strategy: JwtStrategy;
  let cacheManager: { get: ReturnType<typeof vi.fn> };
  let sessionRevocation: { getAuthState: ReturnType<typeof vi.fn> };

  const payload: JwtPayload = {
    sub: 'user-1',
    email: 'lama@example.com',
    role: UserRole.RESPONDENT,
    sessionId: 'sess-1',
    type: 'access',
    tv: 3,
  };

  beforeEach(() => {
    cacheManager = { get: vi.fn().mockResolvedValue('{"userId":"user-1"}') };
    sessionRevocation = {
      getAuthState: vi.fn().mockResolvedValue({
        email: 'baru@example.com',
        role: UserRole.RESPONDENT,
        status: UserStatus.ACTIVE,
        tokenVersion: 3,
      }),
    };
    const configService = { getOrThrow: () => 'unit-test-secret' } as any;
    strategy = new JwtStrategy(configService, cacheManager as any, sessionRevocation as any);
  });

  it('mengembalikan SessionInfo dengan peran & email dari DB', async () => {
    const info = await strategy.validate(payload);
    expect(info).toEqual({
      userId: 'user-1',
      email: 'baru@example.com',
      role: UserRole.RESPONDENT,
      sessionId: 'sess-1',
    });
    expect(cacheManager.get).toHaveBeenCalledWith('session:sess-1');
  });

  it('token berklaim super_admin tetap mendapat peran DB (responden)', async () => {
    const info = await strategy.validate({ ...payload, role: UserRole.SUPER_ADMIN });
    expect(info.role).toBe(UserRole.RESPONDENT);
  });

  it('menolak token refresh', async () => {
    await expect(strategy.validate({ ...payload, type: 'refresh' })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('menolak bila sesi Redis sudah dihapus (logout)', async () => {
    cacheManager.get.mockResolvedValue(null);
    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  it('menolak akun yang dinonaktifkan meski sesi & token masih berlaku', async () => {
    sessionRevocation.getAuthState.mockResolvedValue({
      email: 'baru@example.com',
      role: UserRole.ADMIN,
      status: UserStatus.INACTIVE,
      tokenVersion: 3,
    });
    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  it('menolak akun PENDING', async () => {
    sessionRevocation.getAuthState.mockResolvedValue({
      email: 'baru@example.com',
      role: UserRole.RESPONDENT,
      status: UserStatus.PENDING,
      tokenVersion: 3,
    });
    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  it('menolak user yang sudah dihapus', async () => {
    sessionRevocation.getAuthState.mockResolvedValue(null);
    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  it('menolak token dengan versi sesi lama (sesi dicabut)', async () => {
    sessionRevocation.getAuthState.mockResolvedValue({
      email: 'baru@example.com',
      role: UserRole.RESPONDENT,
      status: UserStatus.ACTIVE,
      tokenVersion: 4,
    });
    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  it('menolak token lama tanpa klaim tv', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { tv, ...legacy } = payload;
    await expect(strategy.validate(legacy as JwtPayload)).rejects.toThrow(UnauthorizedException);
  });
});
