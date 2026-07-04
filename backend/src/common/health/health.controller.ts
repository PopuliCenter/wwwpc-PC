import { Controller, Get } from '@nestjs/common';
import { HealthService, HealthStatus } from './health.service';
import { Public } from '@modules/auth/decorators';

/**
 * Health check controller.
 *
 * GET /health
 * Returns 200 when the service is ready to accept traffic.
 * Returns 503 when one or more critical dependencies are unavailable.
 *
 * This endpoint is intentionally excluded from the global /api prefix
 * (see main.ts) so Docker HEALTHCHECK and Kubernetes readiness probes
 * can reach it without the prefix.
 */
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async check(): Promise<HealthStatus> {
    return this.healthService.check();
  }
}
