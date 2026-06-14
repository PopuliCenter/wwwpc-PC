import { useState, useEffect, useCallback } from 'react';
import { api } from '@/services/api';
import { format } from 'date-fns';

// Types — disesuaikan dgn kontrak backend (modules/reward)
interface PointBalance {
  total: number;
  available: number;
  pending: number;
  expiringWithin30Days: number;
}

type TransactionType = 'credit' | 'debit';
type PointReason =
  | 'registration'
  | 'profile_completion'
  | 'survey_completion'
  | 'streak_bonus'
  | 'manual_credit';

interface BackendTransaction {
  id: string;
  amount: number;
  transactionType: TransactionType;
  reason: PointReason;
  earnedAt: string;
}

interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

type RewardCategory = 'pulsa' | 'paket_data' | 'voucher' | 'e_wallet';

interface RewardItem {
  id: string;
  name: string;
  category: RewardCategory;
  pointsCost: number;
  description: string;
  minNominal?: number;
  maxNominal?: number;
}

interface RedemptionResult {
  redemptionId: string;
  status: string;
  message: string;
  otpRequired?: boolean;
}

type RedemptionStep = 'destination' | 'otp' | 'success';

// Kategori aktif saat ini: pulsa + e-wallet. Paket data & voucher menyusul.
const CATEGORY_LABELS: Record<string, string> = {
  pulsa: 'Pulsa',
  e_wallet: 'E-Wallet',
};

const CATEGORY_ICONS: Record<string, string> = {
  pulsa: '📱',
  e_wallet: '💳',
};

const REASON_LABELS: Record<PointReason, string> = {
  registration: 'Bonus registrasi',
  profile_completion: 'Bonus melengkapi profil',
  survey_completion: 'Penyelesaian survei',
  streak_bonus: 'Bonus streak',
  manual_credit: 'Penyesuaian poin',
};

function describeTransaction(tx: BackendTransaction): string {
  if (tx.transactionType === 'debit') return 'Penukaran reward';
  return REASON_LABELS[tx.reason] ?? 'Poin diterima';
}

// Balance Card
function BalanceCard({ balance, loading }: { balance: PointBalance | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="bg-gradient-to-r from-primary-600 to-primary-800 rounded-xl p-6 text-white animate-pulse">
        <div className="h-4 bg-primary-400 rounded w-1/3 mb-3"></div>
        <div className="h-10 bg-primary-400 rounded w-1/2"></div>
      </div>
    );
  }

  const available = balance?.available ?? 0;
  const expiring = balance?.expiringWithin30Days ?? 0;

  return (
    <div className="bg-gradient-to-r from-primary-600 to-primary-800 rounded-xl p-6 text-white">
      <p className="text-sm text-primary-100">Saldo Poin Anda</p>
      <p className="text-4xl font-bold mt-1">{available.toLocaleString()}</p>
      <p className="text-sm text-primary-200 mt-1">poin</p>

      {expiring > 0 && (
        <div className="mt-4 bg-yellow-500/20 border border-yellow-400/30 rounded-lg p-3">
          <p className="text-sm text-yellow-100">
            ⚠️ <span className="font-medium">{expiring.toLocaleString()} poin</span>{' '}
            akan kedaluwarsa dalam 30 hari
          </p>
        </div>
      )}
    </div>
  );
}

// Transaction History
function TransactionHistory({ refreshKey }: { refreshKey: number }) {
  const [transactions, setTransactions] = useState<BackendTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    const fetchTransactions = async () => {
      setLoading(true);
      try {
        const result = await api.get<PaginatedResponse<BackendTransaction>>(
          `/rewards/transactions?page=${page}&pageSize=10`
        );
        setTransactions(Array.isArray(result?.data) ? result.data : []);
        setTotalPages(result?.meta?.totalPages ?? 1);
      } catch {
        setTransactions([]);
        setTotalPages(1);
      } finally {
        setLoading(false);
      }
    };
    fetchTransactions();
  }, [page, refreshKey]);

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Riwayat Transaksi</h3>
      </div>

      {loading ? (
        <div className="p-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse flex items-center gap-3">
              <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
              <div className="flex-1">
                <div className="h-4 bg-gray-200 rounded w-2/3 mb-1"></div>
                <div className="h-3 bg-gray-200 rounded w-1/3"></div>
              </div>
              <div className="h-4 bg-gray-200 rounded w-16"></div>
            </div>
          ))}
        </div>
      ) : transactions.length === 0 ? (
        <div className="p-8 text-center text-gray-500">Belum ada transaksi</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {transactions.map((tx) => {
            const earned = tx.transactionType === 'credit';
            return (
              <div key={tx.id} className="p-4 flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                    earned ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                  }`}
                >
                  {earned ? '+' : '-'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 truncate">{describeTransaction(tx)}</p>
                  <p className="text-xs text-gray-500">
                    {format(new Date(tx.earnedAt), 'dd MMM yyyy, HH:mm')}
                  </p>
                </div>
                <span
                  className={`text-sm font-medium ${earned ? 'text-green-600' : 'text-red-600'}`}
                >
                  {earned ? '+' : '-'}{tx.amount.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="p-4 border-t border-gray-200 flex items-center justify-between">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 text-sm border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            Sebelumnya
          </button>
          <span className="text-sm text-gray-600">
            Halaman {page} dari {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 text-sm border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            Selanjutnya
          </button>
        </div>
      )}
    </div>
  );
}

// Reward Catalog
function RewardCatalog({
  onSelectReward,
  currentBalance,
}: {
  onSelectReward: (reward: RewardItem) => void;
  currentBalance: number;
}) {
  const [rewards, setRewards] = useState<RewardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>('all');

  useEffect(() => {
    const fetchCatalog = async () => {
      try {
        // Backend mengembalikan ARRAY langsung (bukan { data: [...] }).
        const result = await api.get<RewardItem[]>('/rewards/catalog');
        setRewards(Array.isArray(result) ? result : []);
      } catch {
        setRewards([]);
      } finally {
        setLoading(false);
      }
    };
    fetchCatalog();
  }, []);

  const categories = ['all', ...Object.keys(CATEGORY_LABELS)];
  const filteredRewards =
    activeCategory === 'all'
      ? rewards
      : rewards.filter((r) => r.category === activeCategory);

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Katalog Reward</h3>
      </div>

      {/* Category tabs */}
      <div className="p-4 border-b border-gray-200 flex gap-2 overflow-x-auto">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 text-sm rounded-full whitespace-nowrap transition-colors ${
              activeCategory === cat
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {cat === 'all' ? 'Semua' : `${CATEGORY_ICONS[cat] ?? ''} ${CATEGORY_LABELS[cat] ?? cat}`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse border rounded-lg p-4">
              <div className="h-5 bg-gray-200 rounded w-2/3 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-full mb-3"></div>
              <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            </div>
          ))}
        </div>
      ) : filteredRewards.length === 0 ? (
        <div className="p-8 text-center text-gray-500">Tidak ada reward tersedia</div>
      ) : (
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filteredRewards.map((reward) => {
            const canAfford = currentBalance >= reward.pointsCost;
            return (
              <div
                key={reward.id}
                className={`border rounded-lg p-4 transition-colors ${
                  canAfford ? 'hover:border-primary-300' : 'opacity-60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{CATEGORY_ICONS[reward.category] ?? '🎁'}</span>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-gray-900">{reward.name}</h4>
                    <p className="text-xs text-gray-500 mt-1">{reward.description}</p>
                    <p className="text-sm font-bold text-primary-600 mt-2">
                      {reward.pointsCost.toLocaleString()} poin
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => onSelectReward(reward)}
                  disabled={!canAfford}
                  className="mt-3 w-full px-3 py-1.5 text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-primary-600 text-white hover:bg-primary-700"
                >
                  {canAfford ? 'Tukar' : 'Poin tidak cukup'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Redemption Flow Modal
function RedemptionModal({
  reward,
  onClose,
  onSuccess,
}: {
  reward: RewardItem;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState<RedemptionStep>('destination');
  const [destinationNumber, setDestinationNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [redemptionId, setRedemptionId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingBalance, setRemainingBalance] = useState<number | null>(null);

  const handleInitiate = async () => {
    if (!destinationNumber) {
      setError('Masukkan nomor tujuan');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api.post<RedemptionResult>('/rewards/redeem', {
        rewardId: reward.id,
        destinationNumber,
      });
      setRedemptionId(result.redemptionId);
      setStep('otp');
    } catch (e: any) {
      setError(e?.message || 'Gagal memulai penukaran. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (otp.length !== 6) {
      setError('Masukkan 6 digit kode OTP');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.post<RedemptionResult>(`/rewards/redeem/${redemptionId}/confirm`, {
        otpCode: otp,
      });
      // Backend tidak mengembalikan sisa saldo → ambil ulang.
      try {
        const balance = await api.get<PointBalance>('/rewards/balance');
        setRemainingBalance(balance?.available ?? null);
      } catch {
        setRemainingBalance(null);
      }
      setStep('success');
    } catch (e: any) {
      setError(e?.message || 'Kode OTP salah atau sudah kedaluwarsa. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose}></div>
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          aria-label="Tutup"
        >
          ✕
        </button>

        {/* Step: Destination */}
        {step === 'destination' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Tukar Reward</h3>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-sm font-medium text-gray-900">{reward.name}</p>
              <p className="text-sm text-primary-600">{reward.pointsCost.toLocaleString()} poin</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nomor Tujuan
              </label>
              <p className="text-xs text-gray-500 mb-2">
                {reward.category === 'e_wallet'
                  ? 'Masukkan nomor HP yang terdaftar di akun e-wallet'
                  : 'Masukkan nomor telepon'}
              </p>
              <input
                type="tel"
                value={destinationNumber}
                onChange={(e) => setDestinationNumber(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="08xxxxxxxxxx"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              onClick={handleInitiate}
              disabled={loading}
              className="w-full py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 font-medium"
            >
              {loading ? 'Memproses...' : 'Lanjutkan'}
            </button>
          </div>
        )}

        {/* Step: OTP */}
        {step === 'otp' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Konfirmasi OTP</h3>
            <p className="text-sm text-gray-600">
              Masukkan kode OTP 6 digit untuk mengonfirmasi penukaran.
            </p>
            <input
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-center text-2xl tracking-widest font-mono focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              onClick={handleConfirm}
              disabled={loading || otp.length !== 6}
              className="w-full py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 font-medium"
            >
              {loading ? 'Memverifikasi...' : 'Konfirmasi'}
            </button>
          </div>
        )}

        {/* Step: Success */}
        {step === 'success' && (
          <div className="space-y-4 text-center">
            <div className="text-5xl">✅</div>
            <h3 className="text-lg font-semibold text-gray-900">Penukaran Berhasil!</h3>
            <p className="text-sm text-gray-600">
              <span className="font-medium">{reward.name}</span> akan segera diproses ke nomor tujuan Anda.
            </p>
            {remainingBalance !== null && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-gray-500">Sisa saldo</p>
                <p className="text-2xl font-bold text-gray-900">
                  {remainingBalance.toLocaleString()} poin
                </p>
              </div>
            )}
            <button
              onClick={() => {
                onSuccess();
                onClose();
              }}
              className="w-full py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium"
            >
              Selesai
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Main RewardPage
export function RewardPage() {
  const [balance, setBalance] = useState<PointBalance | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [selectedReward, setSelectedReward] = useState<RewardItem | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchBalance = useCallback(async () => {
    try {
      const result = await api.get<PointBalance>('/rewards/balance');
      setBalance(result);
    } catch {
      setBalance({ total: 0, available: 0, pending: 0, expiringWithin30Days: 0 });
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  const handleRedemptionSuccess = () => {
    setSelectedReward(null);
    void fetchBalance();
    setRefreshKey((k) => k + 1); // muat ulang riwayat transaksi
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Reward Saya</h1>

      {/* Balance Card */}
      <BalanceCard balance={balance} loading={balanceLoading} />

      {/* Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Transaction History */}
        <TransactionHistory refreshKey={refreshKey} />

        {/* Reward Catalog */}
        <RewardCatalog
          onSelectReward={setSelectedReward}
          currentBalance={balance?.available ?? 0}
        />
      </div>

      {/* Redemption Modal */}
      {selectedReward && (
        <RedemptionModal
          reward={selectedReward}
          onClose={() => setSelectedReward(null)}
          onSuccess={handleRedemptionSuccess}
        />
      )}
    </div>
  );
}
