import { useState, useEffect, useCallback } from 'react';
import { Wallet, Gift, Hourglass, Clock, Smartphone } from 'lucide-react';
import { api } from '@/services/api';
import { format } from 'date-fns';
import { usePointsStore } from '@/stores/points.store';

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

type RedemptionStatus = 'pending' | 'processing' | 'completed' | 'failed';

interface BackendRedemption {
  id: string;
  rewardType: string;
  pointsSpent: number;
  destinationNumber: string | null;
  status: RedemptionStatus;
  requestedAt: string;
  providerSn: string | null;
  providerMessage: string | null;
}

type RedemptionStep = 'destination' | 'otp' | 'success';

// E-wallet dipecah jadi tab per-dompet agar katalog terlihat penuh & jelas.
// Setiap dompet punya warna aksen sendiri (ikon kartu). Urut sesuai katalog.
const EWALLETS: { key: string; label: string; tone: string }[] = [
  { key: 'gopay', label: 'GoPay', tone: 'bg-teal-50 text-teal-600 ring-teal-100' },
  { key: 'ovo', label: 'OVO', tone: 'bg-violet-50 text-violet-600 ring-violet-100' },
  { key: 'dana', label: 'DANA', tone: 'bg-sky-50 text-sky-600 ring-sky-100' },
  { key: 'shopeepay', label: 'ShopeePay', tone: 'bg-orange-50 text-orange-600 ring-orange-100' },
  { key: 'linkaja', label: 'LinkAja', tone: 'bg-red-50 text-red-600 ring-red-100' },
];

/** Ambil kunci dompet dari id katalog (mis. 'ewallet-gopay-25000' → 'gopay'). */
function walletOf(id: string): string | null {
  const m = /^ewallet-([a-z]+)-/.exec(id);
  return m ? m[1] : null;
}

const REDEMPTION_STATUS_META: Record<
  RedemptionStatus,
  { label: string; badge: string; icon: string }
> = {
  pending: {
    label: 'Menunggu konfirmasi',
    badge: 'bg-gray-100 text-gray-700',
    icon: '🕓',
  },
  processing: {
    label: 'Diproses',
    badge: 'bg-amber-100 text-amber-700',
    icon: '⏳',
  },
  completed: {
    label: 'Berhasil',
    badge: 'bg-green-100 text-green-700',
    icon: '✅',
  },
  failed: {
    label: 'Gagal (poin dikembalikan)',
    badge: 'bg-red-100 text-red-700',
    icon: '❌',
  },
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
      <div className="rounded-2xl bg-gradient-to-br from-primary-600 to-primary-800 p-6">
        <div className="mb-3 h-4 w-1/3 animate-pulse rounded bg-white/20" />
        <div className="h-10 w-1/2 animate-pulse rounded bg-white/20" />
      </div>
    );
  }

  const available = balance?.available ?? 0;
  const pending = balance?.pending ?? 0;
  const expiring = balance?.expiringWithin30Days ?? 0;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-600 to-primary-800 p-6 text-white shadow-sm">
      <Gift className="pointer-events-none absolute -right-5 -top-5 h-28 w-28 text-white/10" />
      <div className="relative">
        <div className="flex items-center gap-2 text-primary-100">
          <Wallet className="h-4 w-4" />
          <p className="text-sm">Saldo Poin Anda</p>
        </div>
        <p className="mt-1 text-4xl font-bold tracking-tight">
          {available.toLocaleString('id-ID')}
        </p>
        <p className="text-sm text-primary-200">poin tersedia</p>

        {(pending > 0 || expiring > 0) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {pending > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
                <Hourglass className="h-3.5 w-3.5" /> {pending.toLocaleString('id-ID')} diproses
              </span>
            )}
            {expiring > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/20 px-3 py-1 text-xs font-medium text-amber-50 ring-1 ring-inset ring-amber-300/30">
                <Clock className="h-3.5 w-3.5" /> {expiring.toLocaleString('id-ID')} kedaluwarsa
                &lt;30 hari
              </span>
            )}
          </div>
        )}
      </div>
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
          `/rewards/transactions?page=${page}&pageSize=10`,
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
    <div className="bg-white rounded-2xl border border-gray-200">
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
                  {earned ? '+' : '-'}
                  {tx.amount.toLocaleString()}
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

// Redemption History — menampilkan status tiap penukaran (indikator in-app)
function RedemptionHistory({ refreshKey }: { refreshKey: number }) {
  const [redemptions, setRedemptions] = useState<BackendRedemption[]>([]);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Peta id katalog → nama ramah (sekali muat).
  useEffect(() => {
    api
      .get<RewardItem[]>('/rewards/catalog')
      .then((result) => {
        const map: Record<string, string> = {};
        (Array.isArray(result) ? result : []).forEach((r) => {
          map[r.id] = r.name;
        });
        setNameMap(map);
      })
      .catch(() => setNameMap({}));
  }, []);

  const fetchRedemptions = useCallback(async () => {
    try {
      const result = await api.get<PaginatedResponse<BackendRedemption>>(
        '/rewards/redemptions?page=1&pageSize=10',
      );
      setRedemptions(Array.isArray(result?.data) ? result.data : []);
    } catch {
      setRedemptions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRedemptions();
  }, [fetchRedemptions, refreshKey]);

  // Auto-refresh selama ada penukaran yang masih berjalan (diproses oleh provider).
  const hasInFlight = redemptions.some((r) => r.status === 'pending' || r.status === 'processing');
  useEffect(() => {
    if (!hasInFlight) return;
    const t = setInterval(() => void fetchRedemptions(), 15000);
    return () => clearInterval(t);
  }, [hasInFlight, fetchRedemptions]);

  return (
    <div className="bg-white rounded-2xl border border-gray-200">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Riwayat Penukaran</h3>
        {hasInFlight && (
          <span className="text-xs text-amber-600 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
            Memantau status…
          </span>
        )}
      </div>

      {loading ? (
        <div className="p-4 space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="animate-pulse flex items-center gap-3">
              <div className="flex-1">
                <div className="h-4 bg-gray-200 rounded w-2/3 mb-1"></div>
                <div className="h-3 bg-gray-200 rounded w-1/3"></div>
              </div>
              <div className="h-6 bg-gray-200 rounded-full w-20"></div>
            </div>
          ))}
        </div>
      ) : redemptions.length === 0 ? (
        <div className="p-8 text-center text-gray-500">Belum ada penukaran</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {redemptions.map((r) => {
            const meta = REDEMPTION_STATUS_META[r.status] ?? REDEMPTION_STATUS_META.processing;
            return (
              <div key={r.id} className="p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 truncate">
                    {nameMap[r.rewardType] ?? r.rewardType}
                  </p>
                  <p className="text-xs text-gray-500">
                    {r.destinationNumber ? `${r.destinationNumber} · ` : ''}
                    {format(new Date(r.requestedAt), 'dd MMM yyyy, HH:mm')}
                  </p>
                  {r.status === 'failed' && r.providerMessage && (
                    <p className="text-xs text-red-500 mt-0.5 truncate">{r.providerMessage}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${meta.badge}`}
                  >
                    {meta.icon} {meta.label}
                  </span>
                  <span className="text-xs text-gray-400">
                    -{r.pointsSpent.toLocaleString()} poin
                  </span>
                </div>
              </div>
            );
          })}
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

  const hasPulsa = rewards.some((r) => r.category === 'pulsa');
  const presentWallets = EWALLETS.filter((w) => rewards.some((r) => walletOf(r.id) === w.key));
  // Tab: Semua · Pulsa · lalu satu tab per dompet (GoPay/OVO/DANA/…).
  const tabs: { key: string; label: string }[] = [
    { key: 'all', label: 'Semua' },
    ...(hasPulsa ? [{ key: 'pulsa', label: 'Pulsa' }] : []),
    ...presentWallets.map((w) => ({ key: `ewallet:${w.key}`, label: w.label })),
  ];
  const filteredRewards =
    activeCategory === 'all'
      ? rewards
      : activeCategory === 'pulsa'
        ? rewards.filter((r) => r.category === 'pulsa')
        : activeCategory.startsWith('ewallet:')
          ? rewards.filter((r) => walletOf(r.id) === activeCategory.slice(8))
          : rewards;

  return (
    <div className="bg-white rounded-2xl border border-gray-200">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Katalog Reward</h3>
      </div>

      {/* Category tabs — Semua · Pulsa · per dompet */}
      <div className="flex gap-2 overflow-x-auto border-b border-gray-200 p-4">
        {tabs.map((t) => {
          const Icon = t.key === 'pulsa' ? Smartphone : Wallet;
          return (
            <button
              key={t.key}
              onClick={() => setActiveCategory(t.key)}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors ${
                activeCategory === t.key
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {t.key !== 'all' && <Icon className="h-3.5 w-3.5" />}
              {t.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex gap-4 overflow-x-auto p-4 pb-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse border rounded-lg p-4 min-w-[240px] shrink-0">
              <div className="h-5 bg-gray-200 rounded w-2/3 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-full mb-3"></div>
              <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            </div>
          ))}
        </div>
      ) : filteredRewards.length === 0 ? (
        <div className="p-8 text-center text-gray-500">Tidak ada reward tersedia</div>
      ) : (
        // List kesamping (horizontal scroll) agar ringkas & mudah dijelajahi.
        <div className="flex gap-4 overflow-x-auto p-4 pb-3 snap-x">
          {filteredRewards.map((reward) => {
            const canAfford = currentBalance >= reward.pointsCost;
            return (
              <div
                key={reward.id}
                className={`flex w-[230px] shrink-0 snap-start flex-col rounded-xl border border-gray-200 p-4 transition-all ${
                  canAfford ? 'hover:border-primary-300 hover:shadow-sm' : 'opacity-60'
                }`}
              >
                <div className="flex flex-1 items-start gap-3">
                  {(() => {
                    const w = walletOf(reward.id);
                    const meta = w ? EWALLETS.find((x) => x.key === w) : null;
                    const Icon = reward.category === 'pulsa' ? Smartphone : Wallet;
                    const tone =
                      meta?.tone ??
                      (reward.category === 'pulsa'
                        ? 'bg-indigo-50 text-indigo-600 ring-indigo-100'
                        : 'bg-gray-50 text-gray-500 ring-gray-100');
                    return (
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${tone}`}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                    );
                  })()}
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-semibold text-gray-900">{reward.name}</h4>
                    <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">
                      {reward.description}
                    </p>
                  </div>
                </div>
                <span className="mt-3 inline-flex w-fit items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 ring-1 ring-inset ring-amber-200">
                  <Gift className="h-3.5 w-3.5" /> {reward.pointsCost.toLocaleString('id-ID')} poin
                </span>
                <button
                  onClick={() => onSelectReward(reward)}
                  disabled={!canAfford}
                  className="mt-3 w-full rounded-lg px-3 py-2 text-sm font-semibold transition-colors bg-primary-600 text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
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
  const [resultStatus, setResultStatus] = useState<string>('processing');
  const [resultMessage, setResultMessage] = useState<string>('');

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
      const result = await api.post<RedemptionResult>(`/rewards/redeem/${redemptionId}/confirm`, {
        otpCode: otp,
      });
      setResultStatus(result.status);
      setResultMessage(result.message || '');
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Nomor Tujuan</label>
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

        {/* Step: Hasil (status-aware: berhasil / diproses / gagal+refund) */}
        {step === 'success' &&
          (() => {
            const failed = resultStatus === 'failed';
            const completed = resultStatus === 'completed';
            const icon = failed ? '❌' : completed ? '✅' : '⏳';
            const title = failed
              ? 'Penukaran Gagal'
              : completed
                ? 'Penukaran Berhasil!'
                : 'Penukaran Diproses';
            const desc = failed
              ? `${resultMessage || 'Penukaran tidak dapat diselesaikan.'} Poin Anda telah dikembalikan.`
              : completed
                ? `${reward.name} telah dikirim ke nomor tujuan Anda.`
                : `${reward.name} sedang diproses. Status akan diperbarui otomatis.`;
            return (
              <div className="space-y-4 text-center">
                <div className="text-5xl">{icon}</div>
                <h3
                  className={`text-lg font-semibold ${failed ? 'text-red-600' : 'text-gray-900'}`}
                >
                  {title}
                </h3>
                <p className="text-sm text-gray-600">{desc}</p>
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
                  className={`w-full py-2 text-white rounded-lg font-medium ${
                    failed ? 'bg-gray-600 hover:bg-gray-700' : 'bg-primary-600 hover:bg-primary-700'
                  }`}
                >
                  {failed ? 'Tutup' : 'Selesai'}
                </button>
              </div>
            );
          })()}
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
      // Sinkronkan saldo header (store bersama).
      usePointsStore.getState().setAvailable(result.available);
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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reward Saya</h1>
        <p className="mt-1 text-sm text-gray-500">
          Tukar poin Anda jadi pulsa atau saldo e-wallet.
        </p>
      </div>

      {/* Balance Card */}
      <BalanceCard balance={balance} loading={balanceLoading} />

      {/* Katalog Reward — tepat di bawah saldo, list kesamping + filter */}
      <RewardCatalog onSelectReward={setSelectedReward} currentBalance={balance?.available ?? 0} />

      {/* Riwayat Transaksi */}
      <TransactionHistory refreshKey={refreshKey} />

      {/* Riwayat Penukaran (status penukaran) — dipindah ke bawah */}
      <RedemptionHistory refreshKey={refreshKey} />

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
