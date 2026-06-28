import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import { ClientLog } from './client-log.entity';
import { CreateClientLogDto } from './dto/create-client-log.dto';

export interface ClientLogQuery {
  page?: number;
  pageSize?: number;
  platform?: string;
  level?: string;
  search?: string;
}

@Injectable()
export class ClientLogService {
  private readonly logger = new Logger(ClientLogService.name);

  constructor(
    @InjectRepository(ClientLog)
    private readonly repo: Repository<ClientLog>,
  ) {}

  /** Simpan satu laporan error klien. Best-effort: kegagalan tak melempar. */
  async record(
    dto: CreateClientLogDto,
    meta: { userId?: string | null; ipAddress?: string | null },
  ): Promise<void> {
    try {
      const entry = this.repo.create({
        level: dto.level ?? 'error',
        message: dto.message.slice(0, 2000),
        stack: dto.stack ?? null,
        source: dto.source ?? null,
        platform: dto.platform ?? null,
        deviceType: dto.deviceType ?? null,
        appVersion: dto.appVersion ?? null,
        userAgent: dto.userAgent ?? null,
        userId: meta.userId ?? null,
        userEmail: dto.userEmail ?? null,
        context: dto.context ?? null,
        ipAddress: meta.ipAddress ?? null,
      });
      await this.repo.save(entry);
    } catch (e: any) {
      this.logger.warn(`Gagal menyimpan client log: ${e?.message ?? e}`);
    }
  }

  /** Daftar log (paginasi + filter) untuk panel admin. */
  async query(q: ClientLogQuery) {
    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 20));
    const qb = this.repo
      .createQueryBuilder('log')
      .orderBy('log.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    if (q.platform) qb.andWhere('log.platform = :platform', { platform: q.platform });
    if (q.level) qb.andWhere('log.level = :level', { level: q.level });
    if (q.search) {
      qb.andWhere('(log.message ILIKE :s OR log.source ILIKE :s)', {
        s: `%${q.search}%`,
      });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async deleteById(id: string): Promise<{ deleted: number }> {
    const res = await this.repo.delete({ id });
    return { deleted: res.affected ?? 0 };
  }

  async deleteByIds(ids: string[]): Promise<{ deleted: number }> {
    if (!ids?.length) return { deleted: 0 };
    const res = await this.repo.delete({ id: In(ids) });
    return { deleted: res.affected ?? 0 };
  }

  async purgeOlderThanDays(days: number): Promise<{ deleted: number }> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const res = await this.repo.delete({ createdAt: LessThan(cutoff) });
    return { deleted: res.affected ?? 0 };
  }
}
