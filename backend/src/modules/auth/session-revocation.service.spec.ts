import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getMetadataArgsStorage } from 'typeorm';
import { SessionRevocationService } from './session-revocation.service';
import { User, UserStatus, USER_SELECT_WITH_PASSWORD } from './entities';
import { UserRole } from '@shared/enums';

describe('SessionRevocationService (audit T-05, T-11)', () => {
  let service: SessionRevocationService;
  let repo: { findOne: ReturnType<typeof vi.fn>; increment: ReturnType<typeof vi.fn> };
  let cache: {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    repo = {
      findOne: vi.fn().mockResolvedValue({
        id: 'u1',
        email: 'a@example.com',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        tokenVersion: 2,
      }),
      increment: vi.fn().mockResolvedValue({ affected: 1 }),
    };
    cache = {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(undefined),
      del: vi.fn().mockResolvedValue(undefined),
    };
    service = new SessionRevocationService(repo as any, cache as any);
  });

  it('membaca peran/status/versi dari DB lalu men-cache singkat', async () => {
    const state = await service.getAuthState('u1');
    expect(state).toEqual({
      email: 'a@example.com',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      tokenVersion: 2,
    });
    expect(repo.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u1' } }));
    // Tidak pernah memuat hash sandi.
    expect(repo.findOne.mock.calls[0][0].select.passwordHash).toBeUndefined();
    expect(cache.set).toHaveBeenCalledWith('auth-state:u1', expect.any(String), 30_000);
  });

  it('memakai cache bila ada (tanpa query DB)', async () => {
    cache.get.mockResolvedValue(
      JSON.stringify({
        email: 'c@example.com',
        role: 'respondent',
        status: 'active',
        tokenVersion: 9,
      }),
    );
    const state = await service.getAuthState('u1');
    expect(state?.tokenVersion).toBe(9);
    expect(repo.findOne).not.toHaveBeenCalled();
  });

  it('null bila user tidak ada', async () => {
    repo.findOne.mockResolvedValue(null);
    expect(await service.getAuthState('hilang')).toBeNull();
  });

  it('revokeAllSessions menaikkan token_version dan membuang cache', async () => {
    await service.revokeAllSessions('u1');
    expect(repo.increment).toHaveBeenCalledWith({ id: 'u1' }, 'tokenVersion', 1);
    expect(cache.del).toHaveBeenCalledWith('auth-state:u1');
  });
});

describe('User entity (audit T-12)', () => {
  it('passwordHash berkolom select:false', () => {
    const col = getMetadataArgsStorage().columns.find(
      (c) => c.target === User && c.propertyName === 'passwordHash',
    );
    expect(col?.options.select).toBe(false);
  });

  it('USER_SELECT_WITH_PASSWORD mencakup SEMUA kolom User', () => {
    const props = getMetadataArgsStorage()
      .columns.filter((c) => c.target === User)
      .map((c) => c.propertyName)
      .sort();
    expect(Object.keys(USER_SELECT_WITH_PASSWORD).sort()).toEqual(props);
  });
});
