import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Wallet,
  Hourglass,
  Clock,
  Smartphone,
  CheckCircle2,
  XCircle,
  Loader,
  Check,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api } from '@/services/api';
import { format } from 'date-fns';
import { Badge, type BadgeTone } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { UnderlineTabs } from '@/components/common/UnderlineTabs';
import { CountUp } from '@/components/common/CountUp';
import { fieldCls } from '@/components/common/fieldStyles';
import { IconButton } from '@/components/common/IconButton';
import { Notice } from '@/components/common/Notice';
import { ListRowsSkeleton, Skeleton } from '@/components/common/Skeleton';
import { usePointsStore } from '@/stores/points.store';
import { pushBackButtonOverride } from '@/utils/nativeBackButton';
import { celebrate } from '@/utils/celebrate';
import { haptic } from '@/utils/haptics';

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
  | 'manual_credit'
  | 'redemption'
  | 'refund';

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
// Tanpa warna per dompet: namanya sudah tertulis di tab dan kartu. Urut sesuai katalog.
const EWALLETS: { key: string; label: string }[] = [
  { key: 'gopay', label: 'GoPay' },
  { key: 'ovo', label: 'OVO' },
  { key: 'dana', label: 'DANA' },
  { key: 'shopeepay', label: 'ShopeePay' },
  { key: 'linkaja', label: 'LinkAja' },
];

/** Ambil kunci dompet dari id katalog (mis. 'ewallet-gopay-25000' → 'gopay'). */
function walletOf(id: string): string | null {
  const m = /^ewallet-([a-z]+)-/.exec(id);
  return m ? m[1] : null;
}

const REDEMPTION_STATUS_META: Record<
  RedemptionStatus,
  { label: string; tone: BadgeTone; Icon: LucideIcon }
> = {
  pending: {
    label: 'Menunggu konfirmasi',
    tone: 'neutral',
    Icon: Clock,
  },
  processing: {
    label: 'Diproses',
    tone: 'warning',
    Icon: Loader,
  },
  completed: {
    label: 'Berhasil',
    tone: 'success',
    Icon: Check,
  },
  failed: {
    label: 'Gagal (poin dikembalikan)',
    tone: 'danger',
    Icon: X,
  },
};

const REASON_LABELS: Record<PointReason, string> = {
  registration: 'Bonus registrasi',
  profile_completion: 'Bonus melengkapi profil',
  survey_completion: 'Penyelesaian survei',
  streak_bonus: 'Bonus streak',
  manual_credit: 'Penyesuaian poin',
  redemption: 'Penukaran reward',
  refund: 'Pengembalian poin',
};

function describeTransaction(tx: BackendTransaction): string {
  if (tx.transactionType === 'debit') return 'Penukaran reward';
  return REASON_LABELS[tx.reason] ?? 'Poin diterima';
}

// Balance Card
function BalanceCard({
  balance,
  loading,
  lastKnown,
}: {
  balance: PointBalance | null;
  loading: boolean;
  /** Saldo terakhir yang sudah dilihat di header; angka menghitung dari nilai ini. */
  lastKnown: number | null;
}) {
  if (loading) {
    return (
      <div className="space-y-3 rounded-xl border border-gray-200 bg-panel p-5">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-9 w-1/2" />
      </div>
    );
  }

  const available = balance?.available ?? 0;
  const pending = balance?.pending ?? 0;
  const expiring = balance?.expiringWithin30Days ?? 0;

  return (
    <div className="rounded-xl border border-gray-200 bg-panel p-5">
      <p className="text-sm text-gray-600">Saldo poin</p>
      <p className="mt-1 text-3xl font-semibold text-gray-900">
        <CountUp value={available} from={lastKnown ?? undefined} />
      </p>
      <p className="text-sm text-gray-600">poin tersedia</p>

      {(pending > 0 || expiring > 0) && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {pending > 0 && (
            <Badge icon={Hourglass} className="tabular-nums">
              {pending.toLocaleString('id-ID')} diproses
            </Badge>
          )}
          {expiring > 0 && (
            <Badge tone="warning" icon={Clock} className="tabular-nums">
              {expiring.toLocaleString('id-ID')} kedaluwarsa &lt;30 hari
            </Badge>
          )}
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
    <div className="rounded-xl border border-gray-200 bg-panel">
      <div className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-base font-semibold text-gray-900">Riwayat transaksi</h2>
      </div>

      {loading ? (
        <ListRowsSkeleton rows={3} />
      ) : transactions.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-600">Belum ada transaksi</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {transactions.map((tx) => {
            const earned = tx.transactionType === 'credit';
            return (
              <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-gray-900">{describeTransaction(tx)}</p>
                  <p className="text-xs tabular-nums text-gray-600">
                    {format(new Date(tx.earnedAt), 'dd MMM yyyy, HH:mm')}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-sm font-medium tabular-nums ${
                    earned ? 'text-success-fg' : 'text-gray-800'
                  }`}
                >
                  {earned ? '+' : '-'}
                  {tx.amount.toLocaleString('id-ID')}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 border-t border-gray-200 p-4">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="shrink-0"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Sebelumnya
          </Button>
          <span className="min-w-0 text-center text-xs tabular-nums text-gray-600">
            Halaman {page} dari {totalPages}
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="shrink-0"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Selanjutnya
          </Button>
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
    <div className="rounded-xl border border-gray-200 bg-panel">
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
        <h2 className="text-base font-semibold text-gray-900">Riwayat penukaran</h2>
        {hasInFlight && <span className="text-xs text-gray-500">Memantau status…</span>}
      </div>

      {loading ? (
        <ListRowsSkeleton rows={2} />
      ) : redemptions.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-600">Belum ada penukaran</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {redemptions.map((r) => {
            const meta = REDEMPTION_STATUS_META[r.status] ?? REDEMPTION_STATUS_META.processing;
            return (
              <div key={r.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-gray-900">
                    {nameMap[r.rewardType] ?? r.rewardType}
                  </p>
                  <p className="text-xs tabular-nums text-gray-600">
                    {r.destinationNumber ? `${r.destinationNumber} · ` : ''}
                    {format(new Date(r.requestedAt), 'dd MMM yyyy, HH:mm')}
                  </p>
                  <Badge tone={meta.tone} icon={meta.Icon} className="mt-1">
                    {meta.label}
                  </Badge>
                  {r.status === 'failed' && r.providerMessage && (
                    <p className="mt-0.5 text-xs text-danger-fg">{r.providerMessage}</p>
                  )}
                </div>
                <span className="shrink-0 text-sm font-medium tabular-nums text-gray-800">
                  -{r.pointsSpent.toLocaleString('id-ID')} poin
                </span>
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

  // Gradien tepi hanya tampil bila masih ada kartu di kanan, supaya kartu terakhir tidak
  // pernah terlihat pudar saat daftar sudah di ujung.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [hasMore, setHasMore] = useState(false);
  const updateHasMore = useCallback(() => {
    const el = scrollerRef.current;
    setHasMore(!!el && el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);
  useEffect(() => {
    updateHasMore();
    window.addEventListener('resize', updateHasMore);
    return () => window.removeEventListener('resize', updateHasMore);
  }, [updateHasMore, loading, activeCategory, filteredRewards.length]);

  return (
    <div className="rounded-xl border border-gray-200 bg-panel">
      <div className="px-4 pt-3">
        <h2 className="text-base font-semibold text-gray-900">Katalog reward</h2>
      </div>

      {/* Category tabs — Semua · Pulsa · per dompet */}
      <UnderlineTabs
        items={tabs}
        active={activeCategory}
        onChange={setActiveCategory}
        className="px-1 pt-1"
      />

      {loading ? (
        <div className="flex gap-3 overflow-x-auto p-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="w-[230px] shrink-0 space-y-2.5 rounded-lg border border-gray-200 p-3"
            >
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-11 w-full" />
            </div>
          ))}
        </div>
      ) : filteredRewards.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-600">Tidak ada reward tersedia</div>
      ) : (
        // List kesamping (horizontal scroll) — gradient di tepi kanan menandakan
        // masih ada pilihan reward lain untuk digeser.
        <div className="relative">
          <div
            ref={scrollerRef}
            onScroll={updateHasMore}
            className="flex snap-x scroll-pl-4 gap-3 overflow-x-auto p-4 [scrollbar-width:none] lg:[scrollbar-width:thin]"
          >
            {filteredRewards.map((reward) => {
              const canAfford = currentBalance >= reward.pointsCost;
              const Icon = reward.category === 'pulsa' ? Smartphone : Wallet;
              return (
                <div
                  key={reward.id}
                  className="flex w-[230px] shrink-0 snap-start flex-col rounded-lg border border-gray-200 p-3"
                >
                  <div className="flex flex-1 items-start gap-2.5">
                    <Icon
                      className="mt-0.5 h-[18px] w-[18px] shrink-0 text-gray-600"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-medium text-gray-900">{reward.name}</h3>
                      <p className="mt-0.5 line-clamp-2 text-xs text-gray-600">
                        {reward.description}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm font-medium tabular-nums text-gray-800">
                    {reward.pointsCost.toLocaleString('id-ID')} poin
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    className="mt-2 w-full"
                    onClick={() => onSelectReward(reward)}
                    disabled={!canAfford}
                  >
                    {canAfford ? 'Tukar' : 'Poin tidak cukup'}
                  </Button>
                </div>
              );
            })}
          </div>
          {hasMore && (
            <div className="pointer-events-none absolute inset-y-0 right-0 w-10 rounded-br-xl bg-gradient-to-l from-panel to-transparent" />
          )}
        </div>
      )}
    </div>
  );
}

// Redemption Flow Modal
function RedemptionModal({
  reward,
  currentBalance,
  onClose,
  onSuccess,
}: {
  reward: RewardItem;
  currentBalance: number;
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
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendMsg, setResendMsg] = useState<string | null>(null);

  // Hitung mundur cooldown tombol "kirim ulang" (cegah spam).
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // Kunci scroll latar saat modal terbuka + tombol Back Android → TUTUP modal
  // (bukan keluar aplikasi / pindah rute saat OTP penukaran sedang berjalan).
  // Override didaftarkan ke koordinator pusat agar tidak dobel-aksi dengan
  // handler default NativeBackGuard.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const removeOverride = pushBackButtonOverride(() => onClose());
    return () => {
      document.body.style.overflow = prevOverflow;
      removeOverride();
    };
  }, [onClose]);

  const handleInitiate = async () => {
    if (currentBalance < reward.pointsCost) {
      setError('Poin tidak mencukupi untuk reward ini.');
      return;
    }
    if (destinationNumber.replace(/\D/g, '').length < 9) {
      setError('Nomor tujuan tidak valid (minimal 9 digit).');
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
      setResendCooldown(60);
    } catch (e: any) {
      setError(e?.message || 'Gagal memulai penukaran. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || loading) return;
    setError(null);
    setResendMsg(null);
    try {
      await api.post(`/rewards/redeem/${redemptionId}/resend-otp`, {});
      setResendMsg('Kode OTP baru telah dikirim. Cek email Anda (termasuk folder spam).');
      setOtp('');
      setResendCooldown(60);
    } catch (e: any) {
      setError(e?.message || 'Gagal mengirim ulang kode. Silakan coba lagi.');
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
        // Sinkronkan saldo header (store bersama) setelah penukaran mendebit poin.
        if (balance) usePointsStore.getState().setAvailable(balance.available);
      } catch {
        setRemainingBalance(null);
      }
      setStep('success');
      // Rayakan bila penukaran diterima (completed/processing); getar gagal bila ditolak.
      if (result.status === 'failed') {
        void haptic('error');
      } else {
        celebrate();
        void haptic('success');
      }
    } catch (e: any) {
      setError(e?.message || 'Kode OTP salah atau sudah kedaluwarsa. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true"></div>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="redeem-dialog-title"
        className="relative max-h-full w-full max-w-md overflow-y-auto rounded-xl bg-panel p-5 shadow-xl"
      >
        {/* Tombol tutup; pembungkus yang absolute karena IconButton sendiri relative. */}
        <div className="absolute right-3 top-3">
          <IconButton aria-label="Tutup" onClick={onClose}>
            <X className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
          </IconButton>
        </div>

        {/* Step: Destination */}
        {step === 'destination' && (
          <div className="space-y-4">
            <h2 id="redeem-dialog-title" className="pr-10 text-lg font-semibold text-gray-900">
              Tukar reward
            </h2>
            <div className="space-y-1.5 rounded-lg bg-gray-50 p-3 tabular-nums">
              <p className="text-sm font-medium text-gray-900">{reward.name}</p>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Biaya</span>
                <span className="font-medium text-gray-900">
                  {reward.pointsCost.toLocaleString('id-ID')} poin
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Saldo Anda</span>
                <span className="text-gray-800">{currentBalance.toLocaleString('id-ID')} poin</span>
              </div>
              <div className="flex items-center justify-between border-t border-gray-200 pt-1.5 text-sm">
                <span className="text-gray-600">Sisa setelah tukar</span>
                <span
                  className={`font-medium ${currentBalance - reward.pointsCost < 0 ? 'text-danger-fg' : 'text-gray-900'}`}
                >
                  {(currentBalance - reward.pointsCost).toLocaleString('id-ID')} poin
                </span>
              </div>
            </div>
            {currentBalance - reward.pointsCost < 0 && (
              <Notice tone="danger">
                Poin Anda kurang {(reward.pointsCost - currentBalance).toLocaleString('id-ID')}.
                Selesaikan lebih banyak survei untuk menambah poin.
              </Notice>
            )}
            <div>
              <label
                htmlFor="redeem-destination"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Nomor tujuan
              </label>
              <p id="redeem-destination-hint" className="mb-2 text-xs text-gray-600">
                {reward.category === 'e_wallet'
                  ? 'Masukkan nomor HP yang terdaftar di akun e-wallet'
                  : 'Masukkan nomor telepon'}
              </p>
              <input
                id="redeem-destination"
                type="tel"
                value={destinationNumber}
                onChange={(e) => setDestinationNumber(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="08xxxxxxxxxx"
                aria-describedby="redeem-destination-hint"
                className={fieldCls}
              />
            </div>
            {error && (
              <Notice tone="danger" role="alert">
                {error}
              </Notice>
            )}
            <Button
              type="button"
              className="w-full"
              isLoading={loading}
              onClick={handleInitiate}
              disabled={
                currentBalance < reward.pointsCost ||
                destinationNumber.replace(/\D/g, '').length < 9
              }
            >
              {loading ? 'Memproses...' : 'Lanjutkan & kirim OTP'}
            </Button>
            <p className="text-xs text-gray-600">
              Kode OTP akan dikirim ke email Anda untuk mengonfirmasi penukaran.
            </p>
          </div>
        )}

        {/* Step: OTP */}
        {step === 'otp' && (
          <div className="space-y-4">
            <h2 id="redeem-dialog-title" className="pr-10 text-lg font-semibold text-gray-900">
              Konfirmasi OTP
            </h2>
            <p className="text-sm text-gray-600">
              Kami mengirim kode OTP 6 digit ke email Anda. Masukkan di bawah untuk mengonfirmasi
              penukaran. Kode bisa perlu beberapa saat — cek juga folder spam.
            </p>
            {/* text-2xl! : fieldCls sudah membawa ukuran teks, jadi ukuran OTP harus menang. */}
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label="Kode OTP 6 digit"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              placeholder="······"
              maxLength={6}
              className={`${fieldCls} text-center text-2xl! tabular-nums tracking-widest`}
            />
            {resendMsg && <p className="text-sm text-success-fg">{resendMsg}</p>}
            {error && (
              <Notice tone="danger" role="alert">
                {error}
              </Notice>
            )}
            <Button
              type="button"
              className="w-full"
              isLoading={loading}
              onClick={handleConfirm}
              disabled={otp.length !== 6}
            >
              {loading ? 'Memverifikasi...' : 'Konfirmasi'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full tabular-nums"
              onClick={handleResend}
              disabled={resendCooldown > 0 || loading}
            >
              {resendCooldown > 0
                ? `Kirim ulang kode (${resendCooldown}s)`
                : 'Tidak menerima kode? Kirim ulang'}
            </Button>
          </div>
        )}

        {/* Step: Hasil (status-aware: berhasil / diproses / gagal+refund) */}
        {step === 'success' &&
          (() => {
            const failed = resultStatus === 'failed';
            const completed = resultStatus === 'completed';
            const StatusIcon = failed ? XCircle : completed ? CheckCircle2 : Hourglass;
            const title = failed
              ? 'Penukaran gagal'
              : completed
                ? 'Penukaran berhasil'
                : 'Penukaran diproses';
            const desc = failed
              ? `${resultMessage || 'Penukaran tidak dapat diselesaikan.'} Poin Anda telah dikembalikan.`
              : completed
                ? `${reward.name} telah dikirim ke nomor tujuan Anda.`
                : `${reward.name} sedang diproses. Status akan diperbarui otomatis.`;
            return (
              <div className="space-y-4">
                <StatusIcon
                  className={`h-8 w-8 ${
                    failed ? 'text-danger-fg' : completed ? 'text-success-fg' : 'text-warning-fg'
                  }`}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <h2
                  id="redeem-dialog-title"
                  className={`pr-10 text-lg font-semibold ${failed ? 'text-danger-fg' : 'text-gray-900'}`}
                >
                  {title}
                </h2>
                <p className="text-sm text-gray-600">{desc}</p>
                {remainingBalance !== null && (
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-sm text-gray-600">Sisa saldo</p>
                    <p className="text-2xl font-semibold text-gray-900">
                      <CountUp value={remainingBalance} from={currentBalance} /> poin
                    </p>
                  </div>
                )}
                <Button
                  type="button"
                  variant={failed ? 'secondary' : 'primary'}
                  className="w-full"
                  onClick={() => {
                    onSuccess();
                    onClose();
                  }}
                >
                  {failed ? 'Tutup' : 'Selesai'}
                </Button>
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
  // Saldo di header sebelum halaman ini memuat; dibaca sekali karena fetchBalance menimpanya.
  const [lastKnownBalance] = useState(() => usePointsStore.getState().available);

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
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reward saya</h1>
        <p className="mt-1 text-sm text-gray-600">
          Tukar poin Anda jadi pulsa atau saldo e-wallet.
        </p>
      </div>

      {/* Balance Card */}
      <BalanceCard balance={balance} loading={balanceLoading} lastKnown={lastKnownBalance} />

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
          currentBalance={balance?.available ?? 0}
          onClose={() => setSelectedReward(null)}
          onSuccess={handleRedemptionSuccess}
        />
      )}
    </div>
  );
}
