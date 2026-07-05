import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * ThrottlerGuard yang dapat DINONAKTIFKAN penuh via env `DISABLE_THROTTLE=true`.
 * Dipakai HANYA untuk LOAD TEST dari satu IP — tanpa ini, limit anti-brute-force
 * per-endpoint (mis. login 5/menit/IP) membuat ribuan virtual-user gagal login.
 * Di produksi env ini TIDAK diset → rate limiting tetap aktif seperti biasa.
 */
@Injectable()
export class EnvThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(_context: ExecutionContext): Promise<boolean> {
    return process.env.DISABLE_THROTTLE === 'true';
  }
}
