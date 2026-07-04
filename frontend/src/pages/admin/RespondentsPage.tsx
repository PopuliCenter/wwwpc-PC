import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Search,
  FileSpreadsheet,
  FileText,
  Loader2,
  Trash2,
  ChevronUp,
  ChevronDown,
  Upload,
  Download,
} from 'lucide-react';
import ExcelJS from 'exceljs';
import { api } from '@/services/api';
import { useConfirm } from '@/components/common/ConfirmDialog';

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

  const SortHead = ({
    k,
    label,
    className = '',
  }: {
    k: SortKey;
    label: string;
    className?: string;
  }) => (
    <th
      className={`cursor-pointer select-none whitespace-nowrap px-3 py-2.5 hover:text-gray-700 ${className}`}
      onClick={() => toggleSort(k)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === k &&
          (sortDir === 'asc' ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          ))}
      </span>
    </th>
  );

  return (
    <div className="space-y-4">
      {dialog}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Responden</h1>
          <p className="text-sm text-gray-500">
            Daftar responden mandiri — filter, urutkan, dan kelola.
          </p>
        </div>
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
          <button
            onClick={downloadTemplate}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Download className="h-4 w-4" /> Template
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Impor Excel
          </button>
          <button
            onClick={exportExcel}
            disabled={displayed.length === 0}
            className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </button>
          <button
            onClick={exportCsv}
            disabled={displayed.length === 0}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <FileText className="h-4 w-4" /> CSV
          </button>
        </div>
      </div>

      {/* Toolbar: cari + filter */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama/email/telepon…"
            className="w-64 rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />
        </div>
        <select
          value={filterProvince}
          onChange={(e) => setFilterProvince(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Semua provinsi</option>
          {provinceOptions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          value={filterGender}
          onChange={(e) => setFilterGender(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Semua gender</option>
          <option value="male">Laki-laki</option>
          <option value="female">Perempuan</option>
          <option value="other">Lainnya</option>
        </select>
        {(filterProvince || filterGender) && (
          <button
            onClick={() => {
              setFilterProvince('');
              setFilterGender('');
            }}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Reset filter
          </button>
        )}
        {selectedCount > 0 && (
          <button
            onClick={handleBulkDelete}
            disabled={bulkBusy}
            className="ml-auto inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {bulkBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Hapus terpilih ({selectedCount})
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {info && (
        <div className="rounded-md border border-primary-200 bg-primary-50 p-3 text-sm text-primary-700">
          {info}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={allDisplayedSelected}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
              </th>
              <SortHead k="fullName" label="Nama" />
              <th className="px-3 py-2.5">Email</th>
              <th className="px-3 py-2.5">Telepon</th>
              <SortHead k="age" label="Umur" />
              <SortHead k="gender" label="Jenis Kelamin" />
              <th className="px-3 py-2.5">Pekerjaan</th>
              <th className="px-3 py-2.5">Pendidikan</th>
              <th className="px-3 py-2.5">Agama</th>
              <SortHead k="province" label="Provinsi" />
              <SortHead k="city" label="Kota/Kab" />
              <SortHead k="district" label="Kecamatan" />
              <th className="px-3 py-2.5">Alamat</th>
              <SortHead k="registeredAt" label="Tgl Daftar" />
              <th className="px-3 py-2.5 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr>
                <td colSpan={15} className="px-3 py-10 text-center text-gray-400">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            )}
            {!loading && displayed.length === 0 && (
              <tr>
                <td colSpan={15} className="px-3 py-10 text-center text-gray-400">
                  Tidak ada responden.
                </td>
              </tr>
            )}
            {!loading &&
              displayed.map((r) => (
                <tr
                  key={r.id}
                  className={selected.has(r.id) ? 'bg-primary-50/40' : 'hover:bg-gray-50'}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggleSelect(r.id)}
                      className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-gray-800">
                    {r.fullName}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-600">{r.email}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-600">{r.phone}</td>
                  <td className="px-3 py-2 text-gray-600">{r.age ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                    {r.gender ? (GENDER_LABEL[r.gender] ?? r.gender) : '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                    {r.occupation ?? '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                    {r.education ?? '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-600">{r.religion ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-600">{r.province ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-600">{r.city ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-600">{r.district ?? '—'}</td>
                  <td className="max-w-xs truncate px-3 py-2 text-gray-600" title={r.address ?? ''}>
                    {r.address ?? '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-500">
                    {fmtDate(r.registeredAt)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <button
                      onClick={() => handleDelete(r)}
                      title="Hapus responden"
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 hover:text-red-800"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Hapus
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {!loading && (
        <p className="text-xs text-gray-400">
          Menampilkan {displayed.length} dari {respondents.length} responden
          {selectedCount > 0 ? ` · ${selectedCount} terpilih` : ''}.
        </p>
      )}
    </div>
  );
}
