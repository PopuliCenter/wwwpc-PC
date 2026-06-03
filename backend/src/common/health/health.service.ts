import {
  Injectable,
  ServiceUnavailableException,
  Inject,
  Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

export interface ComponentHealth {
  status: 'up' | 'down';
  responseTimeMs?: number;
  error?: string;
}

export interface HealthStatus {
  status: 'ok' | 'degraded';
  timestamp: string;
  version: string;
  uptime: number;
  components: {
    database: ComponentHealth;
    cache: ComponentHealth;
  };
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly version: string;

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {
    // Read from package.json via env var or default to 'unknown'
    this.version = process.env.npm_package_version ?? 'unknown';
  }

  async check(): Promise<HealthStatus> {
    const [database, cache] = await Promise.all([
      this.checkDatabase(),
      this.checkCache(),
    ]);

    const allUp = database.status === 'up' && cache.status === 'up';

    const result: HealthStatus = {
      status: allUp ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      version: this.version,
      uptime: Math.floor(process.uptime()),
      components: { database, cache },
    };

    if (!allUp) {
      // Log as warning — the caller receives 503
      this.logger.warn('Health check degraded', JSON.stringify(result.components));
      throw new ServiceUnavailableException(result);
    }

    return result;
  }

  // ---------------------------------------------------------------------------

  private async checkDatabase(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'up', responseTimeMs: Date.now() - start };
    } catch (err: any) {
      return { status: 'down', responseTimeMs: Date.now() - start, error: err.message };
    }
  }

  private async checkCache(): Promise<ComponentHealth> {
    const start = Date.now();
    const probeKey = '__health_probe__';
    try {
      await this.cacheManager.set(probeKey, '1', 5000);
      const val = await this.cacheManager.get(probeKey);
      if (val !== '1') throw new Error('Cache read/write mismatch');
      await this.cacheManager.del(probeKey);
      return { status: 'up', responseTimeMs: Date.now() - start };
    } catch (err: any) {
      return { status: 'down', responseTimeMs: Date.now() - start, error: err.message };
    }
  }
}
