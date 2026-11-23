/**
 * Pengaman skrip seed (audit T-01): skrip seed membuat akun dengan kredensial
 * yang bisa ditebak dan/atau memberi poin. Tolak berjalan di produksi kecuali
 * operator SENGAJA menyetel `ALLOW_SEED_IN_PRODUCTION=true`.
 */
export const SEED_OVERRIDE_ENV = 'ALLOW_SEED_IN_PRODUCTION';

export function isSeedAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV !== 'production') return true;
  return env[SEED_OVERRIDE_ENV] === 'true';
}

/** Lempar error bila skrip seed dijalankan di produksi tanpa override eksplisit. */
export function assertSeedAllowed(scriptName: string, env: NodeJS.ProcessEnv = process.env): void {
  if (!isSeedAllowed(env)) {
    throw new Error(
      `${scriptName} ditolak: NODE_ENV=production. Skrip seed membuat akun uji dan ` +
        `tidak boleh dijalankan ke database produksi. Bila memang disengaja, set ` +
        `${SEED_OVERRIDE_ENV}=true.`,
    );
  }
}
