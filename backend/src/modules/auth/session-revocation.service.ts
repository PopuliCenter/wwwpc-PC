import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { UserRole } from '@shared/enums';
import { User, UserStatus } from './entities';

/** Keadaan otorisasi user yang dibaca JwtStrategy pada setiap request. */
export interface UserAuthState {
  email: string;
  role: UserRole;
  status: UserStatus;
  tokenVersion: number;
}

const AUTH_STATE_PREFIX = 'auth-state:';
/**
 * Cache singkat agar JwtStrategy tidak query DB di setiap request. Semua
 * perubahan peran/status/sesi lewat `revokeAllSessions`/`clearAuthState` yang
 * langsung menghapus entri ini, jadi TTL hanya batas atas untuk jalur lain.
 */
const AUTH_STATE_TTL_MS = 30_000;

/**
 * Sumber kebenaran sesi (audit T-05, T-11): peran & status dibaca dari DB (bukan
 * dari isi token), dan semua sesi user bisa dicabut sekaligus dengan menaikkan
 * `users.token_version`.
 */
@Injectable()
export class SessionRevocationService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  private key(userId: string): string {
    return `${AUTH_STATE_PREFIX}${userId}`;
  }

  /** Peran/status/versi sesi terkini; null bila user sudah tidak ada. */
  async getAuthState(userId: string): Promise<UserAuthState | null> {
    const cached = await this.cacheManager.get<string>(this.key(userId));
    if (cached) {
      try {
        return JSON.parse(cached) as UserAuthState;
      } catch {
        /* entri rusak → baca ulang dari DB */
      }
    }

    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: { id: true, email: true, role: true, status: true, tokenVersion: true },
    });
    if (!user) return null;

    const state: UserAuthState = {
      email: user.email,
      role: user.role,
      status: user.status,
      tokenVersion: user.tokenVersion ?? 0,
    };
    await this.cacheManager.set(this.key(userId), JSON.stringify(state), AUTH_STATE_TTL_MS);
    return state;
  }

  /**
   * Cabut SEMUA sesi (access + refresh) milik user: token yang sudah terbit
   * membawa `tv` lama sehingga ditolak JwtStrategy dan endpoint refresh.
   * Panggil SETELAH perubahan user tersimpan (di luar transaksi) agar cache
   * tidak terisi ulang dengan data sebelum commit.
   */
  async revokeAllSessions(userId: string): Promise<void> {
    await this.userRepository.increment({ id: userId }, 'tokenVersion', 1);
    await this.clearAuthState(userId);
  }

  /** Buang cache keadaan otorisasi (mis. setelah aktivasi atau hapus akun). */
  async clearAuthState(userId: string): Promise<void> {
    await this.cacheManager.del(this.key(userId));
  }
}
