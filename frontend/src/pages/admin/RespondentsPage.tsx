import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Search,
  FileSpreadsheet,
  FileText,
  Trash2,
  ChevronUp,
  ChevronDown,
  Upload,
  Download,
  BellRing,
} from 'lucide-react';
import ExcelJS from 'exceljs';
import { api } from '@/services/api';
import { Button } from '@/components/common/Button';
import { thBaseCls, tdBaseCls } from '@/components/common/tableStyles';
import { RowCheckbox } from '@/components/common/RowCheckbox';
import { useConfirm } from '@/components/common/ConfirmDialog';
import { RowMenu } from '@/components/common/RowMenu';
import { Notice } from '@/components/common/Notice';
import { TableSkeleton } from '@/components/common/Skeleton';
import { fieldCls } from '@/components/common/fieldStyles';
import { showAppNotice, type AppNotice } from '@/stores/notification.store';
import { useAuthStore } from '@/stores/auth.store';
import { access, hasRole } from '@/config/access';

// Tabel gaya laporan: garis tebal navy di bawah kepala, garis tipis antar baris.
// Kelas dasar dipisah dari warna/padding: utilitas yang bentrok dimenangkan urutan CSS.
const thBase = `${thBaseCls} whitespace-nowrap py-2.5`;
const thCls = `${thBase} text-left`;
const tdBase = tdBaseCls;
const tdCls = `${tdBase} py-3 text-gray-600`;

interface Respondent {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  age: number | null;
  gender: string | null;
  occupation: string | null;
  education: string | null;
  religion: string | null;
  province: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  registeredAt: string;
}

const GENDER_LABEL: Record<string, string> = {
  male: 'Laki-laki',
  female: 'Perempuan',
  other: 'Lainnya',
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const COLUMNS: { key: keyof Respondent | 'genderLabel'; label: string }[] = [
  { key: 'fullName', label: 'Nama' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Telepon' },
  { key: 'age', label: 'Umur' },
  { key: 'genderLabel', label: 'Jenis Kelamin' },
  { key: 'occupation', label: 'Pekerjaan' },
  { key: 'education', label: 'Pendidikan' },
  { key: 'religion', label: 'Agama' },
  { key: 'province', label: 'Provinsi' },
  { key: 'city', label: 'Kota/Kabupaten' },
  { key: 'district', label: 'Kecamatan' },
  { key: 'address', label: 'Alamat' },
  { key: 'registeredAt', label: 'Tanggal Daftar' },
];

function toRow(r: Respondent): Record<string, string | number> {
  const row: Record<string, string | number> = {};
  for (const col of COLUMNS) {
    if (col.key === 'genderLabel')
      row[col.label] = r.gender ? (GENDER_LABEL[r.gender] ?? r.gender) : '';
    else if (col.key === 'registeredAt') row[col.label] = fmtDate(r.registeredAt);
    else {
      const v = r[col.key as keyof Respondent];
      row[col.label] = v == null ? '' : (v as string | number);
    }
  }
  return row;
}

/** Respons POST /notifications/test-push. */
interface TestPushResult {
  /** false bila push (FIREBASE_SERVICE_ACCOUNT) belum dikonfigurasi di server. */
  pushEnabled: boolean;
  /** Jumlah perangkat terdaftar milik responden. */
  devices: number;
  /** Jumlah yang diterima FCM. */
  pushed: number;
}

/** Terjemahkan hasil push uji ke pesan awam untuk admin. */
function describeTestPush(res: TestPushResult, name: string): Pick<AppNotice, 'title' | 'tone'> {
  if (!res.pushEnabled) return { title: 'Push belum aktif di server.', tone: 'warning' };
  if (res.devices === 0) {
    return {
      title: `${name} belum punya perangkat terdaftar. Minta ia membuka aplikasi Android dan mengizinkan notifikasi.`,
      tone: 'warning',
    };
  }
  // pushed = 0 bisa karena token mati ATAU karena FCM sendiri gagal (kredensial,
  // jaringan, kuota) — server tidak membedakannya, jadi pesan tetap netral.
  if (res.pushed === 0) {
    return {
      title: `Tidak ada yang diterima FCM untuk ${res.devices} perangkat. Token mungkin kedaluwarsa atau layanan push bermasalah; cek log server.`,
      tone: 'warning',
    };
  }
  return { title: `Terkirim ke ${res.pushed} perangkat.`, tone: 'success' };
}

type SortKey = 'fullName' | 'age' | 'gender' | 'province' | 'city' | 'district' | 'registeredAt';

/** Tulis workbook exceljs → picu unduhan file .xlsx di browser. */
async function downloadWorkbook(wb: ExcelJS.Workbook, filename: string): Promise<void> {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Parser CSV sederhana (dukung field berkutip & "" escape). */
function parseCsvText(text: string): Record<string, unknown>[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '');
  if (lines.length === 0) return [];
  const parseLine = (line: string): string[] => {
    const cells: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i++;
          } else inQuotes = false;
        } else cur += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === ',') {
        cells.push(cur);
        cur = '';
      } else cur += ch;
    }
    cells.push(cur);
    return cells;
  };
  const headers = parseLine(lines[0]);
  return lines.slice(1).map((line) => {
    const vals = parseLine(line);
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      obj[h] = vals[i] ?? '';
    });
    return obj;
  });
}

/** Baca baris impor dari file: CSV diparse manual (aman), .xlsx via exceljs. */
async function parseImportRows(file: File): Promise<Record<string, unknown>[]> {
  const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv';
  if (isCsv) return parseCsvText(await file.text());

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  for (let c = 1; c <= headerRow.cellCount; c++) headers.push(headerRow.getCell(c).text);
  const out: Record<string, unknown>[] = [];
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      obj[h] = row.getCell(i + 1).text;
    });
    out.push(obj);
  });
  return out;
}

export function RespondentsPage() {
  const [respondents, setRespondents] = useState<Respondent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  // Filter, sort, pilih
  const [filterProvince, setFilterProvince] = useState('');
  const [filterGender, setFilterGender] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('registeredAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const { confirm, dialog } = useConfirm();
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Push uji: aturan peran sama dengan menu Pengumuman (backend juga menolak peran lain).
  const role = useAuthStore((s) => s.user?.role);
  const canTestPush = hasRole(role, access.announcements);
  const [testingIds, setTestingIds] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async (q: string) => {
    setLoading(true);
    setError('');
    try {
      const data = await api.get<Respondent[]>(
        `/users/respondents${q ? `?search=${encodeURIComponent(q)}` : ''}`,
      );
      setRespondents(data ?? []);
      setSelected(new Set());
    } catch {
      setError('Gagal memuat data responden.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData('');
  }, [fetchData]);
  useEffect(() => {
    const t = setTimeout(() => void fetchData(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search, fetchData]);

  const provinceOptions = useMemo(
    () =>
      Array.from(new Set(respondents.map((r) => r.province).filter(Boolean))).sort() as string[],
    [respondents],
  );

  // Filter + sort di klien
  const displayed = useMemo(() => {
    let rows = respondents;
    if (filterProvince) rows = rows.filter((r) => r.province === filterProvince);
    if (filterGender) rows = rows.filter((r) => r.gender === filterGender);
    const dir = sortDir === 'asc' ? 1 : -1;
    const val = (r: Respondent): string | number => {
      if (sortKey === 'age') return r.age ?? -1;
      if (sortKey === 'registeredAt') return r.registeredAt;
      if (sortKey === 'gender') return r.gender ? (GENDER_LABEL[r.gender] ?? r.gender) : '';
      return (r[sortKey] ?? '') as string;
    };
    return [...rows].sort((a, b) => {
      const va = val(a),
        vb = val(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [respondents, filterProvince, filterGender, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const allDisplayedSelected = displayed.length > 0 && displayed.every((r) => selected.has(r.id));
  const toggleSelectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allDisplayedSelected) displayed.forEach((r) => next.delete(r.id));
      else displayed.forEach((r) => next.add(r.id));
      return next;
    });
  };
  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const handleDelete = async (r: Respondent) => {
    const ok = await confirm({
      title: 'Hapus responden',
      message: `Hapus permanen responden "${r.fullName}" (${r.email})?`,
      confirmText: 'Hapus',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/users/${r.id}`);
      setRespondents((prev) => prev.filter((x) => x.id !== r.id));
    } catch (e) {
      setError((e as { message?: string })?.message || 'Gagal menghapus responden.');
    }
  };

  // Kirim satu push uji ke semua perangkat responden (tidak masuk feed lonceng).
  const handleTestPush = async (r: Respondent) => {
    if (testingIds.has(r.id)) return;
    setTestingIds((prev) => new Set(prev).add(r.id));
    try {
      const res = await api.post<TestPushResult>('/notifications/test-push', { userId: r.id });
      showAppNotice(describeTestPush(res, r.fullName));
    } catch (e) {
      const message = (e as { message?: unknown })?.message;
      showAppNotice({
        title: 'Gagal mengirim notifikasi uji',
        body: typeof message === 'string' ? message : undefined,
        tone: 'error',
      });
    } finally {
      setTestingIds((prev) => {
        const next = new Set(prev);
        next.delete(r.id);
        return next;
      });
    }
  };

  const handleBulkDelete = async () => {
    const ids = displayed.filter((r) => selected.has(r.id)).map((r) => r.id);
    if (ids.length === 0) return;
    const ok = await confirm({
      title: 'Hapus responden terpilih',
      message: `Hapus permanen ${ids.length} responden terpilih? Tindakan ini tidak dapat dibatalkan.`,
      confirmText: 'Hapus',
      danger: true,
    });
    if (!ok) return;
    setBulkBusy(true);
    setError('');
    setInfo('');
    try {
      const res = await api.post<{ deleted: number; skipped: { id: string; reason: string }[] }>(
        '/users/bulk-delete',
        { ids },
      );
      const deletedIds = new Set(ids.filter((id) => !res.skipped.some((s) => s.id === id)));
      setRespondents((prev) => prev.filter((x) => !deletedIds.has(x.id)));
      setSelected(new Set());
      setInfo(
        `${res.deleted} responden dihapus.` +
          (res.skipped.length ? ` ${res.skipped.length} dilewati (mis. membuat survei).` : ''),
      );
    } catch (e) {
      setError((e as { message?: string })?.message || 'Gagal menghapus massal.');
    } finally {
      setBulkBusy(false);
    }
  };

  const stamp = () => new Date().toISOString().slice(0, 10);
  const exportRows = () => displayed; // ikut hasil filter & sort

  const exportExcel = async () => {
    const headers = COLUMNS.map((c) => c.label);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Responden');
    ws.addRow(headers);
    exportRows().forEach((r) => {
      const row = toRow(r);
      ws.addRow(headers.map((h) => row[h] ?? ''));
    });
    await downloadWorkbook(wb, `responden-${stamp()}.xlsx`);
  };
  const exportCsv = () => {
    const header = COLUMNS.map((c) => c.label);
    const esc = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      header.join(','),
      ...exportRows().map((r) => {
        const row = toRow(r);
        return header.map((h) => esc(row[h])).join(',');
      }),
    ];
    const blob = new Blob([String.fromCharCode(0xfeff) + lines.join('\r\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `responden-${stamp()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Impor responden dari Excel/CSV ──────────────────────────────────────────
  // Unduh template Excel (kolom: Nama Lengkap, Email, Nomor Telepon).
  const downloadTemplate = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Responden');
    ws.addRow(['Nama Lengkap', 'Email', 'Nomor Telepon']);
    ws.addRow(['Budi Santoso', 'budi@email.com', '081234567890']);
    await downloadWorkbook(wb, 'template-impor-responden.xlsx');
  };

  // Ambil nilai kolom secara fleksibel (case-insensitive, beberapa alias).
  const pick = (row: Record<string, unknown>, aliases: string[]): string => {
    const norm = (s: string) => s.toLowerCase().replace(/[\s_]/g, '');
    const wanted = aliases.map(norm);
    for (const key of Object.keys(row)) {
      if (wanted.includes(norm(key))) return String(row[key] ?? '').trim();
    }
    return '';
  };

  const handleImportFile = async (file: File) => {
    setError('');
    setInfo('');
    setImporting(true);
    try {
      const rows = await parseImportRows(file);

      // Bersihkan koma/baris baru (CSV backend dipisah koma per baris).
      const clean = (s: string) => s.replace(/[\n\r,]/g, ' ').trim();
      const csvLines: string[] = [];
      let skipped = 0;
      for (const row of rows) {
        const name = clean(pick(row, ['Nama Lengkap', 'Nama', 'Name', 'fullName']));
        const email = clean(pick(row, ['Email', 'email']));
        const phone = clean(pick(row, ['Nomor Telepon', 'Telepon', 'No HP', 'Phone', 'HP']));
        if (!name && !email && !phone) continue; // baris kosong
        if (!email) {
          skipped++;
          continue;
        }
        csvLines.push(`${name},${email},${phone},respondent`);
      }

      if (csvLines.length === 0) {
        setError('Tidak ada baris valid. Pastikan ada kolom Nama Lengkap, Email, Nomor Telepon.');
        return;
      }

      const res = await api.post<{
        successCount: number;
        errors: { row: number; email?: string; reason: string }[];
      }>('/users/bulk-import', { csv: csvLines.join('\n') });

      const failParts: string[] = [];
      if (res.errors?.length) failParts.push(`${res.errors.length} gagal`);
      if (skipped) failParts.push(`${skipped} dilewati (tanpa email)`);
      setInfo(
        `${res.successCount} responden diimpor` +
          (failParts.length ? ` — ${failParts.join(', ')}.` : '.') +
          (res.errors?.length
            ? ` Contoh: ${res.errors
                .slice(0, 3)
                .map((e) => `baris ${e.row}: ${e.reason}`)
                .join('; ')}`
            : ''),
      );
      void fetchData(search.trim());
    } catch {
      setError('Gagal membaca file. Pastikan format Excel (.xlsx) atau CSV yang benar.');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const selectedCount = displayed.filter((r) => selected.has(r.id)).length;

  // Fungsi render, bukan komponen: komponen yang dibuat ulang tiap render me-remount th dan
  // tombolnya, sehingga fokus keyboard hilang ke body setiap kali sortir ditekan.
  const renderSortHead = (k: SortKey, label: string, numeric = false) => (
    <th
      aria-sort={sortKey === k ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
      className={`${thBaseCls} whitespace-nowrap py-0 lg:py-2.5 ${
        numeric ? 'text-right' : 'text-left'
      }`}
    >
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className={`inline-flex min-h-11 min-w-11 items-center gap-1 font-medium hover:text-gray-900 lg:min-h-0 ${
          numeric ? 'justify-end' : ''
        }`}
      >
        {label}
        {sortKey === k &&
          (sortDir === 'asc' ? (
            <ChevronUp className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          ))}
      </button>
    </th>
  );

  return (
    <div className="space-y-4">
      {dialog}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Responden</h1>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImportFile(f);
            }}
          />
          <Button type="button" variant="secondary" onClick={downloadTemplate}>
            <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Template
          </Button>
          <Button type="button" onClick={() => fileInputRef.current?.click()} isLoading={importing}>
            {!importing && <Upload className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
            Impor Excel
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={exportExcel}
            disabled={displayed.length === 0}
          >
            <FileSpreadsheet className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Excel
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={exportCsv}
            disabled={displayed.length === 0}
          >
            <FileText className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> CSV
          </Button>
        </div>
      </div>

      {/* Toolbar: cari + filter */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama/email/telepon…"
            aria-label="Cari responden"
            className={`${fieldCls} pl-9`}
          />
        </div>
        <div className="w-full sm:w-48">
          <select
            value={filterProvince}
            onChange={(e) => setFilterProvince(e.target.value)}
            aria-label="Filter provinsi"
            className={fieldCls}
          >
            <option value="">Semua provinsi</option>
            {provinceOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="w-full sm:w-44">
          <select
            value={filterGender}
            onChange={(e) => setFilterGender(e.target.value)}
            aria-label="Filter jenis kelamin"
            className={fieldCls}
          >
            <option value="">Semua gender</option>
            <option value="male">Laki-laki</option>
            <option value="female">Perempuan</option>
            <option value="other">Lainnya</option>
          </select>
        </div>
        {(filterProvince || filterGender) && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setFilterProvince('');
              setFilterGender('');
            }}
          >
            Reset filter
          </Button>
        )}
        {selectedCount > 0 && (
          <Button
            type="button"
            variant="danger"
            onClick={handleBulkDelete}
            isLoading={bulkBusy}
            className="ml-auto"
          >
            {!bulkBusy && <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
            Hapus terpilih ({selectedCount})
          </Button>
        )}
      </div>

      {error && (
        <Notice tone="danger" role="alert">
          {error}
        </Notice>
      )}
      {info && <Notice>{info}</Notice>}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-panel">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className={thCls}>
                  <RowCheckbox
                    label="Pilih semua responden"
                    checked={allDisplayedSelected}
                    onChange={toggleSelectAll}
                  />
                </th>
                {renderSortHead('fullName', 'Nama')}
                <th className={thCls}>Email</th>
                <th className={thCls}>Telepon</th>
                {renderSortHead('age', 'Umur', true)}
                {renderSortHead('gender', 'Jenis Kelamin')}
                <th className={thCls}>Pekerjaan</th>
                <th className={thCls}>Pendidikan</th>
                <th className={thCls}>Agama</th>
                {renderSortHead('province', 'Provinsi')}
                {renderSortHead('city', 'Kota/Kab')}
                {renderSortHead('district', 'Kecamatan')}
                <th className={thCls}>Alamat</th>
                {renderSortHead('registeredAt', 'Tgl Daftar')}
                <th className={`${thBase} text-right`}>Aksi</th>
              </tr>
            </thead>
            <tbody className="[&>tr:last-child>td]:border-b-0">
              {loading && (
                <tr>
                  <td colSpan={15} className="p-0">
                    <TableSkeleton rows={6} cols={6} />
                  </td>
                </tr>
              )}
              {!loading && displayed.length === 0 && (
                <tr>
                  <td colSpan={15} className={`${tdBase} py-10 text-center text-gray-600`}>
                    Tidak ada responden.
                  </td>
                </tr>
              )}
              {!loading &&
                displayed.map((r) => (
                  <tr
                    key={r.id}
                    className={selected.has(r.id) ? 'bg-primary-50' : 'hover:bg-gray-50'}
                  >
                    <td className={tdCls}>
                      <RowCheckbox
                        label={`Pilih ${r.fullName}`}
                        checked={selected.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                      />
                    </td>
                    <td className={`${tdBase} whitespace-nowrap py-3 font-medium text-gray-800`}>
                      {r.fullName}
                    </td>
                    <td className={`${tdCls} whitespace-nowrap`}>{r.email}</td>
                    <td className={`${tdCls} whitespace-nowrap tabular-nums`}>{r.phone}</td>
                    <td className={`${tdCls} text-right tabular-nums`}>{r.age ?? '—'}</td>
                    <td className={`${tdCls} whitespace-nowrap`}>
                      {r.gender ? (GENDER_LABEL[r.gender] ?? r.gender) : '—'}
                    </td>
                    <td className={`${tdCls} whitespace-nowrap`}>{r.occupation ?? '—'}</td>
                    <td className={`${tdCls} whitespace-nowrap`}>{r.education ?? '—'}</td>
                    <td className={`${tdCls} whitespace-nowrap`}>{r.religion ?? '—'}</td>
                    <td className={`${tdCls} whitespace-nowrap`}>{r.province ?? '—'}</td>
                    <td className={`${tdCls} whitespace-nowrap`}>{r.city ?? '—'}</td>
                    <td className={`${tdCls} whitespace-nowrap`}>{r.district ?? '—'}</td>
                    <td className={`${tdCls} max-w-xs truncate`} title={r.address ?? ''}>
                      {r.address ?? '—'}
                    </td>
                    <td className={`${tdCls} whitespace-nowrap tabular-nums`}>
                      {fmtDate(r.registeredAt)}
                    </td>
                    <td className={`${tdBase} whitespace-nowrap py-1.5 text-right`}>
                      <RowMenu
                        label={`Aksi untuk ${r.fullName}`}
                        items={[
                          canTestPush && {
                            label: testingIds.has(r.id)
                              ? 'Mengirim notifikasi uji…'
                              : 'Kirim notifikasi uji',
                            title: 'Kirim satu notifikasi uji ke HP responden ini',
                            icon: BellRing,
                            disabled: testingIds.has(r.id),
                            onClick: () => void handleTestPush(r),
                          },
                          {
                            label: 'Hapus',
                            title: 'Hapus permanen responden ini',
                            icon: Trash2,
                            destructive: true,
                            onClick: () => void handleDelete(r),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {!loading && (
        <p className="text-xs tabular-nums text-gray-500">
          Menampilkan {displayed.length} dari {respondents.length} responden
          {selectedCount > 0 ? ` · ${selectedCount} terpilih` : ''}.
        </p>
      )}
    </div>
  );
}
