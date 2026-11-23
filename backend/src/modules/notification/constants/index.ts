export const NOTIFICATION_QUEUE = 'notification';
export const EMAIL_JOB = 'send-email';
export const BULK_EMAIL_JOB = 'send-bulk-email';

export const EMAIL_RETRY_ATTEMPTS = 3;
export const EMAIL_RETRY_DELAY = 5000; // 5 seconds base delay
export const EMAIL_BACKOFF_TYPE = 'exponential' as const;

// Jumlah email yang boleh dikirim BERSAMAAN oleh worker (default 5). Dipasangkan
// dgn SMTP pool maxConnections agar tidak melebihi kapasitas koneksi provider.
// Override via env EMAIL_CONCURRENCY.
export const EMAIL_CONCURRENCY = Number(process.env.EMAIL_CONCURRENCY ?? '5');

export const POINTS_THRESHOLD = 10000;

export const REMINDER_DAYS = {
  H3: 3,
  H1: 1,
} as const;

/**
 * Opsi default job antrean notifikasi (T-34): job sukses langsung dihapus, job
 * gagal permanen disimpan maks 7 hari (diagnosa) lalu dibuang otomatis, agar
 * email/nama penerima tidak menumpuk tanpa batas di Redis.
 */
export const NOTIFICATION_DEFAULT_JOB_OPTIONS = {
  removeOnComplete: true,
  removeOnFail: { age: 7 * 24 * 60 * 60 },
} as const;
