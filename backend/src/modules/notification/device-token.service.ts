import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DeviceToken } from './entities/device-token.entity';
import { PushService, PushPayload } from './push.service';

/**
 * Pengelola token perangkat (FCM/APNs) + pengiriman push ke user tertentu.
 */
@Injectable()
export class DeviceTokenService {
  private readonly logger = new Logger(DeviceTokenService.name);

  constructor(
    @InjectRepository(DeviceToken)
    private readonly deviceTokenRepository: Repository<DeviceToken>,
    private readonly pushService: PushService,
  ) {}

  /**
   * Daftarkan/segarkan token milik user. Idempoten: token UNIK, jadi token yang
   * sama dipindahkan ke user terakhir yang memakainya (mis. login akun lain di
   * perangkat sama) + perbarui last_seen_at.
   */
  async register(userId: string, token: string, platform: string): Promise<void> {
    await this.deviceTokenRepository.upsert(
      { userId, token, platform, lastSeenAt: new Date() },
      { conflictPaths: ['token'], skipUpdateIfNoValuesChanged: false },
    );
  }

  /** Hapus token (mis. saat logout atau token dilaporkan kedaluwarsa oleh FCM). */
  async removeTokens(tokens: string[]): Promise<void> {
    if (tokens.length === 0) return;
    await this.deviceTokenRepository.delete({ token: In(tokens) });
  }

  /** Ambil semua token milik sekumpulan user. */
  async getTokensForUsers(userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];
    const rows = await this.deviceTokenRepository.find({
      where: { userId: In(userIds) },
      select: ['token'],
    });
    return rows.map((r) => r.token);
  }

  /**
   * Kirim push ke semua perangkat milik sekumpulan user. Membersihkan token yang
   * sudah tak valid. Mengembalikan jumlah push terkirim.
   */
  async pushToUsers(userIds: string[], payload: PushPayload): Promise<number> {
    const tokens = await this.getTokensForUsers(userIds);
    if (tokens.length === 0) return 0;

    const { sent, failedTokens } = await this.pushService.sendToTokens(tokens, payload);
    if (failedTokens.length > 0) {
      await this.removeTokens(failedTokens).catch((e) =>
        this.logger.warn(`Gagal membersihkan token kedaluwarsa: ${e.message}`),
      );
    }
    return sent;
  }
}
