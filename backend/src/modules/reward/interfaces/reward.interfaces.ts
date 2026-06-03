export interface PointBalance {
  total: number;
  available: number;
  pending: number;
  expiringWithin30Days: number;
}

export interface StreakInfo {
  currentStreakDays: number;
  currentMultiplier: number;
  lastCompletionDate: Date | null;
}

export interface RewardItem {
  id: string;
  name: string;
  category: RewardCategory;
  pointsCost: number;
  description: string;
  minNominal?: number;
  maxNominal?: number;
}

export type RewardCategory = 'pulsa' | 'paket_data' | 'voucher' | 'e_wallet';

export interface RedemptionResult {
  redemptionId: string;
  status: string;
  message: string;
  otpRequired?: boolean;
}

export interface ExpiredPointsSummary {
  totalExpired: number;
  transactionsAffected: number;
  processedAt: Date;
}

export interface CreditPointsOptions {
  userId: string;
  amount: number;
  reason: string;
  referenceId?: string;
}
