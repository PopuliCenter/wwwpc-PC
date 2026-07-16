import { Global, Module } from '@nestjs/common';
import { CronLockService } from './cron-lock.service';

/**
 * Global agar service ber-@Cron (audit, data-cleanup, notification, reward)
 * bisa langsung meng-inject CronLockService tanpa import modul per-modul.
 */
@Global()
@Module({
  providers: [CronLockService],
  exports: [CronLockService],
})
export class CronLockModule {}
