/**
 * Env default untuk E2E (di-load lewat setupFiles SEBELUM AppModule diimpor,
 * sehingga config yang membaca process.env saat modul dimuat mendapat nilai ini).
 * Nilai hanya diisi bila BELUM ada → CI bisa menimpanya lewat env workflow.
 */
function def(key: string, value: string): void {
  if (!process.env[key]) process.env[key] = value;
}

def('NODE_ENV', 'test');

// Database test (docker-compose.test.yml → port 5433). Skema dibuat otomatis.
def('DB_HOST', '127.0.0.1');
def('DB_PORT', '5433');
def('DB_USERNAME', 'test');
def('DB_PASSWORD', 'test');
def('DB_DATABASE', 'survei_test');
// Skema dibangun lewat MIGRASI ASLI (lihat prepareSchema di app-harness) —
// bukan synchronize — agar partial unique index (dipakai ON CONFLICT reward/
// response) ikut terbentuk, sama seperti produksi.
def('DB_SYNCHRONIZE', 'false');
def('DB_SSL', 'false');

// Redis test (port 6380, PASSWORDLESS) — dipakai cache/session + Bull.
// Tanpa password: konsisten dengan service container Redis di CI.
def('REDIS_HOST', '127.0.0.1');
def('REDIS_PORT', '6380');
def('REDIS_DB', '0');
def('BULL_REDIS_HOST', '127.0.0.1');
def('BULL_REDIS_PORT', '6380');
def('BULL_REDIS_DB', '0');

// Auth / JWT (nilai uji; ≥32 char).
def('JWT_SECRET', 'e2e-test-secret-do-not-use-in-prod-0123456789');
def('JWT_ACCESS_EXPIRES_IN', '15m');
def('JWT_REFRESH_EXPIRES_IN', '7d');
def('SESSION_TTL', '604800');

// Nonaktifkan guard durasi-minimum submit agar bisa submit langsung di test.
def('MIN_COMPLETION_SECONDS', '0');

// Reward: provider manual (tanpa panggilan PPOB eksternal). Email dummy — OTP
// tetap tersimpan di DB (dibaca test); pengiriman email async & tak memblokir.
def('REWARD_PROVIDER', 'manual');
def('EMAIL_PROVIDER', 'smtp');
def('SMTP_HOST', 'localhost');
def('SMTP_PORT', '1025');
def('MAIL_FROM', 'Test <test@example.com>');

def('ALLOWED_ORIGINS', '');
