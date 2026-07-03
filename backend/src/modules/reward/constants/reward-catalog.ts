import { RewardItem } from '../interfaces';

/**
 * Katalog reward aktif.
 *
 * Fokus saat ini: PULSA (semua operator) + E-WALLET (DANA/OVO/ShopeePay/GoPay/
 * LinkAja). Paket data & voucher menyusul. Setiap item dipetakan ke product_code
 * IAK di fulfillment/iak-products.ts:
 *  - pulsa: operator dideteksi dari nomor HP responden.
 *  - e-wallet: dompet sudah eksplisit pada item (id `ewallet-<dompet>-<nominal>`).
 */

/** Format angka ke ribuan ID tanpa bergantung ICU (mis. 10000 → "10.000"). */
function rp(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Nilai tukar: 1 poin = Rp 10 (mis. Rp 5.000 = 500 poin). Angka bulat & menarik
// secara psikologis agar responden rajin mengisi survei.
const POINTS_BY_NOMINAL: Record<number, number> = {
  5000: 500,
  10000: 1000,
  25000: 2500,
  50000: 5000,
  100000: 10000,
};

const PULSA_NOMINALS = [5000, 10000, 25000, 50000, 100000];

const pulsaItems: RewardItem[] = PULSA_NOMINALS.map((nominal) => ({
  id: `pulsa-${nominal}`,
  name: `Pulsa Rp ${rp(nominal)}`,
  category: 'pulsa',
  pointsCost: POINTS_BY_NOMINAL[nominal],
  description: `Pulsa telepon senilai Rp ${rp(nominal)} (semua operator)`,
}));

const EWALLETS = [
  { key: 'dana', label: 'DANA' },
  { key: 'ovo', label: 'OVO' },
  { key: 'shopeepay', label: 'ShopeePay' },
  { key: 'gopay', label: 'GoPay' },
  { key: 'linkaja', label: 'LinkAja' },
];
const EWALLET_NOMINALS = [10000, 25000, 50000, 100000];

const ewalletItems: RewardItem[] = EWALLETS.flatMap((w) =>
  EWALLET_NOMINALS.map((nominal) => ({
    id: `ewallet-${w.key}-${nominal}`,
    name: `Saldo ${w.label} Rp ${rp(nominal)}`,
    category: 'e_wallet' as const,
    pointsCost: POINTS_BY_NOMINAL[nominal],
    description: `Transfer saldo ${w.label} senilai Rp ${rp(nominal)}`,
  })),
);

export const REWARD_CATALOG: RewardItem[] = [...pulsaItems, ...ewalletItems];

/** Minimum points required for any redemption (= reward termurah, Rp 5.000). */
export const MINIMUM_REDEMPTION_THRESHOLD = 500;

/** Points awarded for specific actions (rate 1 poin = Rp 10). */
export const POINT_VALUES = {
  REGISTRATION: 100,
  PROFILE_COMPLETION: 50,
} as const;

/** Streak multiplier thresholds */
export const STREAK_MULTIPLIERS = {
  DAYS_7: { days: 7, multiplier: 1.5 },
  DAYS_30: { days: 30, multiplier: 2.0 },
} as const;

/** Point expiration period in months */
export const POINT_EXPIRATION_MONTHS = 12;

/** OTP validity period in minutes */
export const REDEMPTION_OTP_TTL_MINUTES = 15;

/** Maks. percobaan OTP salah sebelum penukaran dibatalkan (anti brute-force). */
export const MAX_REDEMPTION_OTP_ATTEMPTS = 5;
