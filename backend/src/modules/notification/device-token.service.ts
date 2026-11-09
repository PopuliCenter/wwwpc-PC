import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DeviceToken } from './entities/device-token.entity';
import { PushService, PushPayload } from './push.service';
import { User } from '@modules/auth/entities/user.entity';

/** Isi push uji dari admin (POST /notifications/test-push). Tidak masuk feed lonceng. */
export const TEST_PUSH_PAYLOAD: PushPayload = {
  title: 'Notifikasi uji',
  body: 'Jika pesan ini muncul, notifikasi di HP Anda sudah berfungsi.',
  data: { link: '/notifications' },
};

/** Jumlah id user per query token (jauh di bawah batas 65.535 parameter Postgres). */
export const TOKEN_QUERY_CHUNK = 10_000;

export interface TestPushResult {
  /** false bila FIREBASE_SERVICE_ACCOUNT kosong di server (push dinonaktifkan). */
  pushEnabled: boolean;
  /** Jumlah token perangkat terdaftar milik user. */
  devices: number;
  /** Jumlah push yang diterima FCM. */
  pushed: number;
}

/**
 * Pengelola token perangkat (FCM/APNs) + pengiriman push ke user tertentu.
 */
@Injectable()
export class DeviceTokenService {
  private readonly logger = new Logger(DeviceTokenService.name);

  constructor(
    @InjectRepository(DeviceToken)
    private readonly deviceTokenRepository: Repository<DeviceToken>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
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

  /**
   * Ambil semua token milik sekumpulan user. Id dipecah per TOKEN_QUERY_CHUNK
   * karena Postgres membatasi 65.535 parameter bind per query: tanpa pemecahan,
   * pengingat/undangan/pengumuman ke >65 ribu responden gagal mengambil token.
   */
  async getTokensForUsers(userIds: string[]): Promise<string[]> {
    const tokens: string[] = [];
    for (let i = 0; i < userIds.length; i += TOKEN_QUERY_CHUNK) {
      const rows = await this.deviceTokenRepository.find({
        where: { userId: In(userIds.slice(i, i + TOKEN_QUERY_CHUNK)) },
        select: ['token'],
      });
      for (const r of rows) tokens.push(r.token);
    }
    return tokens;
  }

  /**
   * Kirim push ke semua perangkat milik sekumpulan user. Membersihkan token yang
   * sudah tak valid. Mengembalikan jumlah push terkirim.
   */
  async pushToUsers(userIds: string[], payload: PushPayload): Promise<number> {
    const tokens = await this.getTokensForUsers(userIds);
    if (tokens.length === 0) return 0;
    return this.sendAndCleanup(tokens, payload);
  }

  /**
   * Push UJI (dipicu admin) ke semua perangkat milik satu user, untuk memastikan
   * notifikasi di HP-nya berfungsi. Tidak menulis ke feed lonceng. Melaporkan
   * apakah push aktif di server, jumlah perangkat terdaftar, dan yang diterima FCM.
   */
  async sendTestPush(userId: string): Promise<TestPushResult> {
    const user = await this.userRepository.findOne({ where: { id: userId }, select: ['id'] });
    if (!user) {
      throw new NotFoundException(`User ${userId} tidak ditemukan`);
    }

    const tokens = await this.getTokensForUsers([userId]);
    const pushEnabled = this.pushService.isEnabled();
    if (!pushEnabled || tokens.length === 0) {
      return { pushEnabled, devices: tokens.length, pushed: 0 };
    }

    const pushed = await this.sendAndCleanup(tokens, TEST_PUSH_PAYLOAD);
    this.logger.log(`Push uji ke user ${userId} → ${pushed}/${tokens.length} perangkat`);
    return { pushEnabled, devices: tokens.length, pushed };
  }

  /** Kirim ke token lalu bersihkan token yang dilaporkan tak valid. Return jumlah terkirim. */
  private async sendAndCleanup(tokens: string[], payload: PushPayload): Promise<number> {
    const { sent, failedTokens } = await this.pushService.sendToTokens(tokens, payload);
    if (failedTokens.length > 0) {
      await this.removeTokens(failedTokens).catch((e) =>
        this.logger.warn(`Gagal membersihkan token kedaluwarsa: ${e.message}`),
      );
    }
    return sent;
  }
}
