import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Archive,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Trash2,
} from 'lucide-react';
import { api } from '@/services/api';
import { pollAndDownloadExport } from '@/utils/exportDownload';
import { format } from 'date-fns';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { thBaseCls, tdBaseCls } from '@/components/common/tableStyles';
import { RowCheckbox } from '@/components/common/RowCheckbox';
import { useConfirm } from '@/components/common/ConfirmDialog';
import { Notice } from '@/components/common/Notice';
import { RowMenu } from '@/components/common/RowMenu';
import { TableSkeleton } from '@/components/common/Skeleton';
import { fieldCls } from '@/components/common/fieldStyles';
import { showAppNotice } from '@/stores/notification.store';
import { ResponseStatusLabel } from './ResponseStatusLabel';

// Tabel gaya laporan: garis tebal navy di bawah kepala, garis tipis antar baris.
const thBase = `${thBaseCls} whitespace-nowrap text-left`;
const thCls = `${thBase} py-2.5`;
const tdBase = `${tdBaseCls} text-sm`;
const tdCls = `${tdBase} py-3 text-gray-600`;
const filterLabelCls = 'mb-1 block text-xs text-gray-600';

interface ResponseItem {
  id: string;
  respondentName: string;
  respondentPhone?: string | null;
  surveyTitle: string;
  status: 'completed' | 'partial' | 'abandoned';
  submittedAt: string;
  deviceType: string;
  surveyId: string;
  surveyType?: string;
  category?: string | null;
  rewardMode?: 'automatic' | 'manual';
  rewardType?: string | null;
  rewardDistributed?: boolean;
  destinationNumber?: string | null;
  duplicateFlag?: boolean;
  archived?: boolean;
}

interface SurveyOption {
  id: string;
  title: string;
  rewardMode: 'automatic' | 'manual';
}

interface FilterState {
  startDate: string;
  endDate: string;
  region: string;
  status: string;
  deviceType: string;
  surveyId: string;
  surveyType: string;
  category: string;
  search: string;
  archived: string;
}

type SortKey = 'respondentName' | 'surveyTitle' | 'status' | 'submittedAt' | 'deviceType';

function ManualRewardPanel({
  responses,
  onMarkDistributed,
}: {
  responses: ResponseItem[];
  onMarkDistributed: (ids: string[]) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const eligibleResponses = responses.filter(
    (r) => r.rewardMode === 'manual' && r.status === 'completed' && !r.rewardDistributed,
  );

  if (eligibleResponses.length === 0) return null;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const toggleAll = () => {
    if (selectedIds.length === eligibleResponses.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(eligibleResponses.map((r) => r.id));
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
      <h3 className="mb-4 text-lg font-semibold text-gray-900">
        Distribusi Reward Manual ({eligibleResponses.length} menunggu)
      </h3>
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr>
              <th className={thCls}>
                <RowCheckbox
                  label="Pilih semua respons"
                  checked={
                    selectedIds.length === eligibleResponses.length && eligibleResponses.length > 0
                  }
                  onChange={toggleAll}
                />
              </th>
              <th className={thCls}>Responden</th>
              <th className={thCls}>Survei</th>
              <th className={thCls}>Jenis</th>
              <th className={thCls}>No. Tujuan</th>
              <th className={thCls}>Tanggal</th>
            </tr>
          </thead>
          <tbody className="[&>tr:last-child>td]:border-b-0">
            {eligibleResponses.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className={tdCls}>
                  <RowCheckbox
                    label={`Pilih ${r.respondentName}`}
                    checked={selectedIds.includes(r.id)}
                    onChange={() => toggleSelect(r.id)}
                  />
                </td>
                <td className={`${tdBase} py-3 text-gray-900`}>{r.respondentName}</td>
                <td className={tdCls}>{r.surveyTitle}</td>
                <td className={`${tdCls} capitalize`}>{r.rewardType ?? '-'}</td>
                <td className={`${tdCls} tabular-nums`}>{r.destinationNumber ?? '-'}</td>
                <td className={`${tdCls} whitespace-nowrap tabular-nums`}>
                  {format(new Date(r.submittedAt), 'dd/MM/yyyy HH:mm')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selectedIds.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <span className="text-sm tabular-nums text-gray-600">{selectedIds.length} dipilih</span>
          <Button
            type="button"
            onClick={() => {
              onMarkDistributed(selectedIds);
              setSelectedIds([]);
            }}
          >
            <Check className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Tandai Sudah
            Didistribusikan
          </Button>
        </div>
      )}
    </div>
  );
}

export function ResponseListPage() {
  const navigate = useNavigate();
  const { confirm, dialog } = useConfirm();
  const [responses, setResponses] = useState<ResponseItem[]>([]);
  const [surveys, setSurveys] = useState<SurveyOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('submittedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filters, setFilters] = useState<FilterState>({
    startDate: '',
    endDate: '',
    region: '',
    status: '',
    deviceType: '',
    surveyId: '',
    surveyType: '',
    category: '',
    search: '',
    archived: '',
  });

  const fetchResponses = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
      if (filters.region) params.set('region', filters.region);
      if (filters.status) params.set('status', filters.status);
      if (filters.deviceType) params.set('deviceType', filters.deviceType);
      if (filters.surveyId) params.set('surveyId', filters.surveyId);
      if (filters.surveyType) params.set('surveyType', filters.surveyType);
      if (filters.category) params.set('category', filters.category);
      if (filters.search) params.set('search', filters.search);
      if (filters.archived) params.set('archived', filters.archived);

      const query = params.toString();
      const result = await api.get<ResponseItem[]>(`/responses${query ? `?${query}` : ''}`);
      setResponses(result);
    } catch {
      setResponses([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchSurveys = async () => {
    try {
      const result = await api.get<SurveyOption[]>('/surveys');
      setSurveys(result);
    } catch {
      setSurveys([]);
    }
  };

  // Daftar respons hanya tampil setelah ada filter (mis. survei) dipilih —
  // saat dibuka tabel sengaja kosong agar admin memilih survei lebih dulu.
  const hasActiveFilter = Object.values(filters).some((v) => v !== '');

  useEffect(() => {
    fetchSurveys();
  }, []);

  // Terapkan filter otomatis saat berubah (debounce agar input teks tidak
  // memicu request tiap ketukan). Tanpa filter, kosongkan tabel tanpa request.
  useEffect(() => {
    if (!hasActiveFilter) {
      setResponses([]);
      setLoading(false);
      return;
    }
    const t = setTimeout(() => {
      void fetchResponses();
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFilters((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleExport = async (fmt: 'csv' | 'excel' | 'pdf' | 'json') => {
    if (!filters.surveyId) {
      showAppNotice({
        title: 'Pilih survei dulu',
        body: 'Pilih survei di filter untuk mengekspor data.',
        tone: 'warning',
      });
      return;
    }
    try {
      const params = new URLSearchParams();
      params.set('surveyId', filters.surveyId);
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);

      const job = await api.post<{ id: string }>(`/export/${fmt}?${params.toString()}`);
      await pollAndDownloadExport(job.id);
    } catch (e) {
      showAppNotice({
        title: `Gagal mengekspor ${fmt.toUpperCase()}`,
        body: (e as { message?: string })?.message,
        tone: 'error',
      });
    }
  };

  const handleMarkDistributed = async (ids: string[]) => {
    try {
      await api.post('/rewards/mark-distributed', { responseIds: ids });
      fetchResponses();
    } catch {
      showAppNotice({ title: 'Gagal menandai reward', tone: 'error' });
    }
  };

  // Hapus respons → responden bisa mengisi survei ini lagi (salah isi / tertahan).
  const handleDelete = async (r: ResponseItem) => {
    const ok = await confirm({
      title: 'Hapus respons',
      message:
        `Hapus respons dari "${r.respondentName}" pada survei "${r.surveyTitle}"?\n\n` +
        'Jawaban akan dihapus permanen dan responden dapat mengisi survei ini kembali.',
      confirmText: 'Hapus',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/responses/${r.id}`);
      setResponses((prev) => prev.filter((x) => x.id !== r.id));
      showAppNotice({ title: 'Respons dihapus', tone: 'success', durationMs: 4000 });
    } catch (e) {
      showAppNotice({
        title: 'Gagal menghapus respons',
        body: (e as { message?: string })?.message,
        tone: 'error',
        durationMs: 6000,
      });
    }
  };

  // Arsipkan respons → data tetap tersimpan, disembunyikan dari daftar aktif,
  // dan responden bisa mengisi survei ini lagi (alternatif aman dari hapus).
  const handleArchive = async (r: ResponseItem) => {
    const ok = await confirm({
      title: 'Arsipkan respons',
      message:
        `Arsipkan respons dari "${r.respondentName}" pada survei "${r.surveyTitle}"?\n\n` +
        'Data tetap tersimpan (bisa dilihat lewat "Tampilkan arsip"), dan responden ' +
        'dapat mengisi survei ini kembali.',
      confirmText: 'Arsipkan',
    });
    if (!ok) return;
    try {
      await api.patch(`/responses/${r.id}/archive`);
      setResponses((prev) => prev.filter((x) => x.id !== r.id));
      showAppNotice({ title: 'Respons diarsipkan', tone: 'success', durationMs: 4000 });
    } catch (e) {
      showAppNotice({
        title: 'Gagal mengarsipkan respons',
        body: (e as { message?: string })?.message,
        tone: 'error',
        durationMs: 6000,
      });
    }
  };

  // Sort di sisi klien atas data yang sudah dimuat (klik header kolom).
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortedResponses = [...responses].sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'submittedAt') {
      cmp = new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
    } else {
      cmp = String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? ''), 'id');
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const renderSortTh = (key: SortKey, label: string) => (
    <th
      aria-sort={sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
      className={`${thBase} py-0 lg:py-2.5`}
    >
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className="inline-flex min-h-11 min-w-11 items-center gap-1 font-medium hover:text-gray-900 lg:min-h-0"
      >
        {label}
        {sortKey === key &&
          (sortDir === 'asc' ? (
            <ChevronUp className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          ))}
      </button>
    </th>
  );

  return (
    <div className="space-y-6">
      {dialog}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Manajemen Respons</h1>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { fmt: 'csv', label: 'CSV' },
              { fmt: 'excel', label: 'Excel' },
              { fmt: 'pdf', label: 'PDF' },
              { fmt: 'json', label: 'JSON' },
            ] as const
          ).map(({ fmt, label }) => (
            <Button
              key={fmt}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => handleExport(fmt)}
            >
              <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> {label}
            </Button>
          ))}
        </div>
      </div>

      {/* Panduan singkat pembersihan data — boleh ditutup, untuk admin awam */}
      <Notice>
        <details>
          <summary className="-my-3 cursor-pointer py-3 font-medium text-gray-900">
            Aturan pembersihan data — kapan Arsip, kapan Hapus?
          </summary>
          <div className="mt-3 space-y-2">
            <p>
              <span className="font-semibold">Arsip (disarankan):</span> data jawaban tetap
              tersimpan, hanya disembunyikan dari daftar aktif. Bisa dilihat lagi lewat tombol{' '}
              <span className="font-medium">“Tampilkan arsip”</span>, dan responden tetap bisa
              mengisi survei ini lagi. Pakai untuk salah isi, pengisian tertahan, atau data
              mencurigakan.
            </p>
            <p>
              <span className="font-semibold">Hapus (permanen):</span> jawaban hilang dan tidak bisa
              dikembalikan. Pakai hanya untuk data uji coba/testing atau permintaan penghapusan data
              pribadi. Responden juga bisa mengisi ulang setelahnya.
            </p>
            <p>
              Keduanya membebaskan responden untuk mengisi ulang dan mengembalikan kuota (jika
              respons sudah selesai). Setiap tindakan dicatat di log audit.
              <span className="font-medium"> Ragu? Pilih Arsip.</span>
            </p>
          </div>
        </details>
      </Notice>

      {/* Filter Panel */}
      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
        {/* Survei — filter utama, ditempatkan di atas & diperbesar */}
        <div>
          <label
            htmlFor="filterSurveyId"
            className="mb-1.5 block text-sm font-semibold text-gray-800"
          >
            Survei
          </label>
          <select
            id="filterSurveyId"
            name="surveyId"
            value={filters.surveyId}
            onChange={handleFilterChange}
            className={fieldCls}
          >
            <option value="">— Pilih survei untuk menampilkan respons —</option>
            {surveys.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </div>

        {/* Pencarian responden */}
        <div>
          <input
            type="text"
            name="search"
            value={filters.search}
            onChange={handleFilterChange}
            placeholder="Cari nama atau nomor HP responden..."
            aria-label="Cari responden"
            className={fieldCls}
          />
        </div>

        {/* Toggle tampilkan respons terarsip */}
        <label className="flex min-h-11 items-center gap-2 text-sm text-gray-600 lg:min-h-0">
          <input
            type="checkbox"
            checked={filters.archived === 'true'}
            onChange={(e) =>
              setFilters((p) => ({ ...p, archived: e.target.checked ? 'true' : '' }))
            }
            className="h-4 w-4 rounded accent-primary-600"
          />
          Tampilkan arsip
        </label>

        {/* Filter lanjutan — disembunyikan agar tidak bertumpuk */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={showAdvanced}
          onClick={() => setShowAdvanced((v) => !v)}
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
            strokeWidth={1.75}
            aria-hidden="true"
          />
          {showAdvanced ? 'Sembunyikan filter lanjutan' : 'Filter lanjutan'}
        </Button>

        {showAdvanced && (
          <div className="grid grid-cols-1 gap-3 border-t border-gray-100 pt-3 md:grid-cols-3 lg:grid-cols-4">
            <div>
              <label htmlFor="filterStartDate" className={filterLabelCls}>
                Dari Tanggal
              </label>
              <input
                id="filterStartDate"
                type="date"
                name="startDate"
                value={filters.startDate}
                onChange={handleFilterChange}
                className={fieldCls}
              />
            </div>
            <div>
              <label htmlFor="filterEndDate" className={filterLabelCls}>
                Sampai Tanggal
              </label>
              <input
                id="filterEndDate"
                type="date"
                name="endDate"
                value={filters.endDate}
                onChange={handleFilterChange}
                className={fieldCls}
              />
            </div>
            <div>
              <label htmlFor="filterRegion" className={filterLabelCls}>
                Wilayah
              </label>
              <input
                id="filterRegion"
                type="text"
                name="region"
                value={filters.region}
                onChange={handleFilterChange}
                placeholder="Semua"
                className={fieldCls}
              />
            </div>
            <div>
              <label htmlFor="filterStatus" className={filterLabelCls}>
                Status
              </label>
              <select
                id="filterStatus"
                name="status"
                value={filters.status}
                onChange={handleFilterChange}
                className={fieldCls}
              >
                <option value="">Semua</option>
                <option value="completed">Selesai</option>
                <option value="partial">Sebagian</option>
                <option value="abandoned">Ditinggalkan</option>
              </select>
            </div>
            <div>
              <label htmlFor="filterDeviceType" className={filterLabelCls}>
                Perangkat
              </label>
              <select
                id="filterDeviceType"
                name="deviceType"
                value={filters.deviceType}
                onChange={handleFilterChange}
                className={fieldCls}
              >
                <option value="">Semua</option>
                <option value="mobile">Mobile</option>
                <option value="desktop">Desktop</option>
                <option value="tablet">Tablet</option>
              </select>
            </div>
            <div>
              <label htmlFor="filterSurveyType" className={filterLabelCls}>
                Tipe Survei
              </label>
              <select
                id="filterSurveyType"
                name="surveyType"
                value={filters.surveyType}
                onChange={handleFilterChange}
                className={fieldCls}
              >
                <option value="">Semua</option>
                <option value="nasional">Nasional</option>
                <option value="daerah">Daerah</option>
                <option value="lainnya">Lainnya</option>
              </select>
            </div>
            <div>
              <label htmlFor="filterCategory" className={filterLabelCls}>
                Kategori
              </label>
              <input
                id="filterCategory"
                type="text"
                name="category"
                value={filters.category}
                onChange={handleFilterChange}
                placeholder="Semua"
                className={fieldCls}
              />
            </div>
          </div>
        )}
      </div>

      {/* Manual Reward Panel */}
      <ManualRewardPanel responses={responses} onMarkDistributed={handleMarkDistributed} />

      {/* Response Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : !hasActiveFilter ? (
          <div className="p-8 text-center text-gray-600">
            Pilih survei (atau filter lain) untuk menampilkan data respons.
          </div>
        ) : responses.length === 0 ? (
          <div className="p-8 text-center text-gray-600">Tidak ada respons ditemukan.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr>
                  {renderSortTh('respondentName', 'Responden')}
                  {renderSortTh('surveyTitle', 'Survei')}
                  {renderSortTh('status', 'Status')}
                  {renderSortTh('submittedAt', 'Tanggal')}
                  {renderSortTh('deviceType', 'Perangkat')}
                  <th className={thCls}>Reward</th>
                  <th className={`${thBaseCls} whitespace-nowrap py-2.5 text-right`}>Aksi</th>
                </tr>
              </thead>
              <tbody className="[&>tr:last-child>td]:border-b-0">
                {sortedResponses.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className={`${tdBase} py-3 text-gray-900`}>
                      <div className="flex flex-wrap items-center gap-x-2">
                        <span>{r.respondentName}</span>
                        {r.duplicateFlag && (
                          <Badge
                            tone="warning"
                            icon={AlertTriangle}
                            title="Nomor tujuan sama dipakai lebih dari satu respons"
                          >
                            Duplikat
                          </Badge>
                        )}
                        {r.archived && <Badge tone="muted">Terarsip</Badge>}
                      </div>
                      {r.respondentPhone && (
                        <span className="text-xs tabular-nums text-gray-500">
                          {r.respondentPhone}
                        </span>
                      )}
                    </td>
                    <td className={tdCls}>{r.surveyTitle}</td>
                    <td className={`${tdBase} whitespace-nowrap py-3`}>
                      <ResponseStatusLabel status={r.status} />
                    </td>
                    <td className={`${tdCls} whitespace-nowrap tabular-nums`}>
                      {format(new Date(r.submittedAt), 'dd/MM/yyyy HH:mm')}
                    </td>
                    <td className={`${tdCls} capitalize`}>{r.deviceType}</td>
                    <td className={tdCls}>
                      {r.rewardMode === 'manual' ? (
                        r.destinationNumber ? (
                          <div>
                            <span className="capitalize">{r.rewardType ?? 'reward'}</span>
                            <span className="block text-xs tabular-nums text-gray-500">
                              {r.destinationNumber}
                            </span>
                            {r.rewardDistributed && (
                              <Badge tone="success" icon={Check}>
                                sudah ditop-up
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500">belum diisi</span>
                        )
                      ) : (
                        <span className="text-xs text-gray-500">otomatis</span>
                      )}
                    </td>
                    <td className={`${tdBase} py-1.5`}>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/admin/responses/${r.id}`)}
                        >
                          Detail
                        </Button>
                        <RowMenu
                          label={`Aksi lainnya untuk respons ${r.respondentName}`}
                          items={[
                            !r.archived && {
                              label: 'Arsipkan',
                              title: 'Data disimpan, responden bisa mengisi ulang',
                              icon: Archive,
                              onClick: () => handleArchive(r),
                            },
                            {
                              label: 'Hapus',
                              title: 'Hapus permanen, responden bisa mengisi ulang',
                              icon: Trash2,
                              destructive: true,
                              onClick: () => handleDelete(r),
                            },
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
