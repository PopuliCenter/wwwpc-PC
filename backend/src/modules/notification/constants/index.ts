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
