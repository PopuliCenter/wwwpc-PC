import { RewardItem } from '../interfaces';

/**
 * Static reward catalog.
 * In production, this could be stored in a database table.
 */
export const REWARD_CATALOG: RewardItem[] = [
  // Pulsa
  {
    id: 'pulsa-5000',
    name: 'Pulsa Rp 5.000',
    category: 'pulsa',
    pointsCost: 10000,
    description: 'Pulsa telepon senilai Rp 5.000',
  },
  {
    id: 'pulsa-10000',
    name: 'Pulsa Rp 10.000',
    category: 'pulsa',
    pointsCost: 20000,
    description: 'Pulsa telepon senilai Rp 10.000',
  },
  {
    id: 'pulsa-25000',
    name: 'Pulsa Rp 25.000',
    category: 'pulsa',
    pointsCost: 45000,
    description: 'Pulsa telepon senilai Rp 25.000',
  },
  {
    id: 'pulsa-50000',
    name: 'Pulsa Rp 50.000',
    category: 'pulsa',
    pointsCost: 85000,
    description: 'Pulsa telepon senilai Rp 50.000',
  },
  {
    id: 'pulsa-100000',
    name: 'Pulsa Rp 100.000',
    category: 'pulsa',
    pointsCost: 160000,
    description: 'Pulsa telepon senilai Rp 100.000',
  },
  // Paket Data
  {
    id: 'data-1gb',
    name: 'Paket Data 1GB',
    category: 'paket_data',
    pointsCost: 15000,
    description: 'Paket data internet 1GB',
  },
  {
    id: 'data-3gb',
    name: 'Paket Data 3GB',
    category: 'paket_data',
    pointsCost: 35000,
    description: 'Paket data internet 3GB',
  },
  {
    id: 'data-5gb',
    name: 'Paket Data 5GB',
    category: 'paket_data',
    pointsCost: 55000,
    description: 'Paket data internet 5GB',
  },
  {
    id: 'data-10gb',
    name: 'Paket Data 10GB',
    category: 'paket_data',
    pointsCost: 100000,
    description: 'Paket data internet 10GB',
  },
  {
    id: 'data-20gb',
    name: 'Paket Data 20GB',
    category: 'paket_data',
    pointsCost: 180000,
    description: 'Paket data internet 20GB',
  },
  // Voucher Belanja
  {
    id: 'voucher-10000',
    name: 'Voucher Belanja Rp 10.000',
    category: 'voucher',
    pointsCost: 20000,
    description: 'Voucher belanja senilai Rp 10.000',
  },
  {
    id: 'voucher-25000',
    name: 'Voucher Belanja Rp 25.000',
    category: 'voucher',
    pointsCost: 45000,
    description: 'Voucher belanja senilai Rp 25.000',
  },
  {
    id: 'voucher-50000',
    name: 'Voucher Belanja Rp 50.000',
    category: 'voucher',
    pointsCost: 85000,
    description: 'Voucher belanja senilai Rp 50.000',
  },
  {
    id: 'voucher-100000',
    name: 'Voucher Belanja Rp 100.000',
    category: 'voucher',
    pointsCost: 160000,
    description: 'Voucher belanja senilai Rp 100.000',
  },
  {
    id: 'voucher-200000',
    name: 'Voucher Belanja Rp 200.000',
    category: 'voucher',
    pointsCost: 300000,
    description: 'Voucher belanja senilai Rp 200.000',
  },
  // E-Wallet
  {
    id: 'ewallet-10000',
    name: 'Transfer E-Wallet Rp 10.000',
    category: 'e_wallet',
    pointsCost: 20000,
    description: 'Transfer e-wallet senilai Rp 10.000',
  },
  {
    id: 'ewallet-25000',
    name: 'Transfer E-Wallet Rp 25.000',
    category: 'e_wallet',
    pointsCost: 45000,
    description: 'Transfer e-wallet senilai Rp 25.000',
  },
  {
    id: 'ewallet-50000',
    name: 'Transfer E-Wallet Rp 50.000',
    category: 'e_wallet',
    pointsCost: 85000,
    description: 'Transfer e-wallet senilai Rp 50.000',
  },
  {
    id: 'ewallet-100000',
    name: 'Transfer E-Wallet Rp 100.000',
    category: 'e_wallet',
    pointsCost: 160000,
    description: 'Transfer e-wallet senilai Rp 100.000',
  },
  {
    id: 'ewallet-500000',
    name: 'Transfer E-Wallet Rp 500.000',
    category: 'e_wallet',
    pointsCost: 750000,
    description: 'Transfer e-wallet senilai Rp 500.000',
  },
];

/** Minimum points required for any redemption */
export const MINIMUM_REDEMPTION_THRESHOLD = 10000;

/** Points awarded for specific actions */
export const POINT_VALUES = {
  REGISTRATION: 500,
  PROFILE_COMPLETION: 250,
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
