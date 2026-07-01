import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { In, IsNull, Repository } from 'typeorm';
import { UserNotification } from './entities/user-notification.entity';
import { User } from '@modules/auth/entities/user.entity';
import { UserRole } from '@shared/enums';
import { UserStatus } from '@modules/auth/entities/user.entity';
import { DeviceTokenService } from './device-token.service';
import { NotificationService } from './notification.service';

export type FeedItemType =
  | 'survey_new'
  | 'survey_done'
  | 'point_earned'
  | 'point_spent'
  | 'reward_fulfilled'
  | 'announcement';

export interface FeedItemInput {
  type: FeedItemType;
  title: string;
  body: string;
  link?: string | null;
}

export interface BroadcastInput {
  title: string;
  body: string;
  link?: string | null;
  /** Sekalian kirim push ke perangkat responden (bila FCM aktif). */
  sendPush?: boolean;
  /** Sekalian kirim email ke responden. */
  sendEmail?: boolean;
}

/**
 * Notifikasi DALAM aplikasi (feed lonceng responden). Mengisi feed otomatis
 * (mis. "survei baru") dan menyiarkan Pengumuman dari admin.
 */
@Injectable()
export class NotificationFeedService {
  private readonly logger = new Logger(NotificationFeedService.name);

  constructor(
    @InjectRepository(UserNotification)
    private readonly feedRepository: Repository<UserNotification>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly deviceTokenService: DeviceTokenService,
    private readonly notificationService: NotificationService,
    private readonly configService: ConfigService,
  ) {}

  /** Buat notifikasi feed untuk sekumpulan user (batch). */
  async createForUsers(userIds: string[], item: FeedItemInput): Promise<void> {
    if (userIds.length === 0) return;
    const rows = userIds.map((userId) =>
      this.feedRepository.create({
        userId,
        type: item.type,
        title: item.title,
        body: item.body,
        link: item.link ?? null,
      }),
    );
    await this.feedRepository.save(rows, { chunk: 500 });
  }

  /**
   * Notifikasi untuk SATU user: tulis ke feed (lonceng) + opsional push ke
   * perangkatnya. Best-effort — push yang gagal tidak menggagalkan pemanggil.
   */
  async notifyUser(userId: string, item: FeedItemInput, push = false): Promise<void> {
    await this.createForUsers([userId], item);
    if (push) {
      await this.deviceTokenService
        .pushToUsers([userId], {
          title: item.title,
          body: item.body,
          data: item.link ? { link: item.link } : {},
        })
        .catch((e) => this.logger.warn(`Gagal push notifikasi user: ${e.message}`));
    }
  }

  /** Hapus satu notifikasi milik user. */
  async deleteOne(userId: string, id: string): Promise<void> {
    await this.feedRepository.delete({ id, userId });
  }

  /** Hapus SEMUA notifikasi milik user (bersihkan tumpukan). */
  async clearAll(userId: string): Promise<void> {
    await this.feedRepository.delete({ userId });
  }

  /** Daftar notifikasi terbaru milik user. */
  async getFeed(userId: string, limit = 30): Promise<UserNotification[]> {
    return this.feedRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 100),
    });
  }

  /** Jumlah notifikasi belum dibaca. */
  async unreadCount(userId: string): Promise<number> {
    return this.feedRepository.count({ where: { userId, readAt: IsNull() } });
  }

  /** Tandai sudah dibaca. Tanpa `ids` → tandai semua milik user. */
  async markRead(userId: string, ids?: string[]): Promise<void> {
    const where =
      ids && ids.length > 0
        ? { userId, id: In(ids), readAt: IsNull() }
        : { userId, readAt: IsNull() };
    await this.feedRepository.update(where, { readAt: new Date() });
  }

  /**
   * Siarkan Pengumuman ke SEMUA responden aktif: masuk feed lonceng + opsional
   * push. Mengembalikan jumlah penerima.
   */
  async broadcastAnnouncement(
    dto: BroadcastInput,
  ): Promise<{ recipients: number; pushed: number; emailed: number }> {
    const respondents = await this.userRepository.find({
      where: { role: UserRole.RESPONDENT, status: UserStatus.ACTIVE },
      select: ['id', 'email', 'fullName'],
    });
    const ids = respondents.map((r) => r.id);
    if (ids.length === 0) return { recipients: 0, pushed: 0, emailed: 0 };

    await this.createForUsers(ids, {
      type: 'announcement',
      title: dto.title,
      body: dto.body,
      link: dto.link ?? null,
    });

    let pushed = 0;
    if (dto.sendPush) {
      pushed = await this.deviceTokenService
        .pushToUsers(ids, {
          title: dto.title,
          body: dto.body,
          data: dto.link ? { link: dto.link } : {},
        })
        .catch((e) => {
          this.logger.warn(`Gagal push pengumuman: ${e.message}`);
          return 0;
        });
    }

    let emailed = 0;
    if (dto.sendEmail) {
      const baseUrl = this.configService.get<string>('APP_BASE_URL') ?? 'http://localhost:3000';
      const actionUrl = dto.link ? `${baseUrl.replace(/\/+$/, '')}${dto.link}` : undefined;
      await this.notificationService
        .sendAnnouncementEmail(
          respondents.map((r) => ({ email: r.email, fullName: r.fullName })),
          { title: dto.title, body: dto.body, actionUrl },
        )
        .then(() => {
          emailed = respondents.length;
        })
        .catch((e) => this.logger.warn(`Gagal email pengumuman: ${e.message}`));
    }

    this.logger.log(`Pengumuman disiarkan → ${ids.length} feed, ${pushed} push, ${emailed} email`);
    return { recipients: ids.length, pushed, emailed };
  }
}
