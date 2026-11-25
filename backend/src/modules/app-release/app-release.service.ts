import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeviceTokenService } from '@modules/notification/device-token.service';
import { NotificationFeedService } from '@modules/notification/notification-feed.service';
import { AppRelease } from './app-release.entity';
import { CreateAppReleaseDto } from './dto/create-app-release.dto';
import {
  APP_UPDATE_ROUTE,
  type AppPlatform,
  DEFAULT_DOWNLOAD_HOSTS,
  VERSION_CACHE_MS,
} from './app-release.constants';

/** Jawaban endpoint publik GET /app/version. */
export interface AppVersionInfo {
  platform: string;
  /** null bila belum ada rilis tercatat (app tidak menampilkan apa pun). */
  latestVersionCode: number | null;
  latestVersionName: string | null;
  /** App dengan versionCode di bawah angka ini wajib update. 0 = tidak ada. */
  minSupportedVersionCode: number;
  downloadUrl: string | null;
  releaseNotes: string | null;
  publishedAt: string | null;
}

export interface AnnounceResult {
  recipients: number;
  pushed: number;
}

/** Daftar host dari env (dipisah koma) atau bawaan. Huruf kecil, tanpa spasi. */
export function parseAllowedHosts(raw: string | undefined): string[] {
  const hosts = (raw ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return hosts.length > 0 ? hosts : DEFAULT_DOWNLOAD_HOSTS;
}

/**
 * Link unduhan aman dibuka app: https, tanpa kredensial, host persis salah satu
 * domain izin atau subdomainnya (`www.populicenter.org` ok; `populicenter.org.evil.id`
 * dan `evilpopulicenter.org` tidak).
 */
export function isAllowedDownloadUrl(url: string, allowedHosts: string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return false;
  const host = parsed.hostname.toLowerCase();
  return allowedHosts.some((h) => host === h || host.endsWith(`.${h}`));
}

/**
 * Rilis aplikasi native: admin mencatat versi baru (opsional wajib update),
 * app menanyakan versi terbaru lewat endpoint publik, dan pengumuman dikirim ke
 * lonceng + push semua pemakai app Android.
 */
@Injectable()
export class AppReleaseService {
  private readonly logger = new Logger(AppReleaseService.name);
  private readonly allowedHosts: string[];
  /** Cache per platform; dibuang saat rilis dibuat/dihapus (replika lain ≤30 dtk). */
  private readonly cache = new Map<string, { at: number; info: AppVersionInfo }>();

  constructor(
    @InjectRepository(AppRelease)
    private readonly repo: Repository<AppRelease>,
    private readonly deviceTokenService: DeviceTokenService,
    private readonly feedService: NotificationFeedService,
    config: ConfigService,
  ) {
    this.allowedHosts = parseAllowedHosts(config.get<string>('APP_DOWNLOAD_ALLOWED_HOSTS'));
  }

  getAllowedHosts(): string[] {
    return [...this.allowedHosts];
  }

  /** Info versi untuk app (publik, di-cache singkat). */
  async getVersionInfo(platform: AppPlatform): Promise<AppVersionInfo> {
    const hit = this.cache.get(platform);
    if (hit && Date.now() - hit.at < VERSION_CACHE_MS) return hit.info;

    const [latest, forced] = await Promise.all([
      this.repo.findOne({ where: { platform }, order: { versionCode: 'DESC' } }),
      this.repo.findOne({ where: { platform, forceUpdate: true }, order: { versionCode: 'DESC' } }),
    ]);
    const info: AppVersionInfo = {
      platform,
      latestVersionCode: latest?.versionCode ?? null,
      latestVersionName: latest?.versionName ?? null,
      minSupportedVersionCode: forced?.versionCode ?? 0,
      downloadUrl: latest?.downloadUrl ?? null,
      releaseNotes: latest?.releaseNotes ?? null,
      publishedAt: latest?.createdAt ? latest.createdAt.toISOString() : null,
    };
    this.cache.set(platform, { at: Date.now(), info });
    return info;
  }

  /** Riwayat rilis (terbaru dulu) untuk panel admin. */
  async list(): Promise<AppRelease[]> {
    return this.repo.find({ order: { platform: 'ASC', versionCode: 'DESC' }, take: 100 });
  }

  /**
   * Catat rilis baru. versionCode harus LEBIH BESAR dari rilis terakhir
   * platform yang sama (mencegah salah ketik membuat app "turun versi").
   */
  async create(
    dto: CreateAppReleaseDto,
    userId: string,
  ): Promise<{ release: AppRelease; announced: AnnounceResult | null }> {
    const platform = (dto.platform ?? 'android') as AppPlatform;
    const downloadUrl = dto.downloadUrl.trim();
    if (!isAllowedDownloadUrl(downloadUrl, this.allowedHosts)) {
      throw new BadRequestException(
        `Link unduhan harus https ke domain resmi: ${this.allowedHosts.join(', ')}`,
      );
    }

    const latest = await this.repo.findOne({ where: { platform }, order: { versionCode: 'DESC' } });
    if (latest && dto.versionCode <= latest.versionCode) {
      throw new BadRequestException(
        `Kode versi harus lebih besar dari rilis terakhir (${latest.versionCode} — v${latest.versionName}).`,
      );
    }

    const release = await this.repo.save(
      this.repo.create({
        platform,
        versionCode: dto.versionCode,
        versionName: dto.versionName.trim(),
        downloadUrl,
        releaseNotes: dto.releaseNotes?.trim() || null,
        forceUpdate: dto.forceUpdate ?? false,
        createdBy: userId,
      }),
    );
    this.cache.delete(platform);

    const announced = dto.notify ? await this.announceRelease(release) : null;
    return { release, announced };
  }

  /** Umumkan (ulang) rilis TERBARU ke pemakai app di platform-nya. */
  async announce(id: string): Promise<AnnounceResult> {
    const release = await this.repo.findOne({ where: { id } });
    if (!release) throw new NotFoundException('Rilis tidak ditemukan');
    const latest = await this.repo.findOne({
      where: { platform: release.platform },
      order: { versionCode: 'DESC' },
    });
    if (latest?.id !== release.id) {
      throw new BadRequestException('Hanya rilis terbaru yang bisa diumumkan.');
    }
    return this.announceRelease(release);
  }

  async remove(id: string): Promise<AppRelease> {
    const release = await this.repo.findOne({ where: { id } });
    if (!release) throw new NotFoundException('Rilis tidak ditemukan');
    await this.repo.delete({ id });
    this.cache.delete(release.platform);
    return release;
  }

  /**
   * Lonceng + push ke user aktif yang punya perangkat di platform rilis. Push
   * hanya ke token platform itu (pengguna web tidak perlu memperbarui apa pun).
   */
  private async announceRelease(release: AppRelease): Promise<AnnounceResult> {
    const userIds = await this.deviceTokenService.activeUserIdsOnPlatform(release.platform);
    const title = release.forceUpdate
      ? 'Pembaruan wajib aplikasi Populi'
      : 'Versi baru aplikasi Populi tersedia';
    const body = release.forceUpdate
      ? `Versi ${release.versionName} wajib dipasang agar aplikasi tetap bisa dipakai. Ketuk untuk memperbarui.`
      : `Versi ${release.versionName} sudah tersedia. Ketuk untuk memperbarui.`;

    if (userIds.length > 0) {
      await this.feedService.createForUsers(userIds, {
        type: 'app_update',
        title,
        body,
        link: APP_UPDATE_ROUTE,
      });
    }
    const pushed =
      userIds.length > 0
        ? await this.deviceTokenService
            .pushToUsers(
              userIds,
              { title, body, data: { link: APP_UPDATE_ROUTE } },
              release.platform,
            )
            .catch((e: Error) => {
              this.logger.warn(`Gagal push pengumuman rilis: ${e.message}`);
              return 0;
            })
        : 0;

    await this.repo.update({ id: release.id }, { notifiedAt: new Date() });
    this.logger.log(
      `Rilis ${release.platform} v${release.versionName} diumumkan → ${userIds.length} lonceng, ${pushed} push`,
    );
    return { recipients: userIds.length, pushed };
  }
}
