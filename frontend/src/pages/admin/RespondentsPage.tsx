import { useState, useEffect, useCallback } from 'react';
import { Search, FileSpreadsheet, FileText, Loader2, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { api } from '@/services/api';

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

/** Kolom export — urutan & label konsisten untuk Excel maupun CSV. */
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
    if (col.key === 'genderLabel') {
      row[col.label] = r.gender ? (GENDER_LABEL[r.gender] ?? r.gender) : '';
    } else if (col.key === 'registeredAt') {
      row[col.label] = fmtDate(r.registeredAt);
    } else {
      const v = r[col.key as keyof Respondent];
      row[col.label] = v == null ? '' : (v as string | number);
    }
  }
  return row;
}

export function RespondentsPage() {
  const [respondents, setRespondents] = useState<Respondent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const fetchData = useCallback(async (q: string) => {
    setLoading(true);
    setError('');
    try {
      const data = await api.get<Respondent[]>(
        `/users/respondents${q ? `?search=${encodeURIComponent(q)}` : ''}`,
      );
      setRespondents(data ?? []);
    } catch {
      setError('Gagal memuat data responden.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData('');
  }, [fetchData]);

  const handleDelete = async (r: Respondent) => {
    if (!window.confirm(`Hapus permanen responden "${r.fullName}" (${r.email})? Tindakan ini tidak dapat dibatalkan.`)) {
      return;
    }
    try {
      await api.delete(`/users/${r.id}`);
      setRespondents((prev) => prev.filter((x) => x.id !== r.id));
    } catch (e) {
      setError((e as { message?: string })?.message || 'Gagal menghapus responden.');
    }
  };

  // Debounce pencarian
  useEffect(() => {
    const t = setTimeout(() => void fetchData(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search, fetchData]);

  const stamp = () => new Date().toISOString().slice(0, 10);

  const exportExcel = () => {
    const rows = respondents.map(toRow);
    const ws = XLSX.utils.json_to_sheet(rows, {
      header: COLUMNS.map((c) => c.label),
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Responden');
    XLSX.writeFile(wb, `responden-${stamp()}.xlsx`);
  };

  const exportCsv = () => {
    const header = COLUMNS.map((c) => c.label);
    const escape = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      header.join(','),
      ...respondents.map((r) => {
        const row = toRow(r);
        return header.map((h) => escape(row[h])).join(',');
      }),
    ];
    // BOM agar Excel membaca UTF-8 dengan benar.
    const blob = new Blob(['﻿' + lines.join('\r\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `responden-${stamp()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const empty = !loading && respondents.length === 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Responden</h1>
          <p className="text-sm text-gray-500">
            Daftar responden yang mendaftar mandiri beserta data demografi.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportExcel}
            disabled={respondents.length === 0}
            className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </button>
          <button
            onClick={exportCsv}
            disabled={respondents.length === 0}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <FileText className="h-4 w-4" /> CSV
          </button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama, email, atau telepon…"
          className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
        />
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.label} className="whitespace-nowrap px-3 py-2.5">{c.label}</th>
              ))}
              <th className="px-3 py-2.5 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="px-3 py-10 text-center text-gray-400">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            )}
            {empty && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="px-3 py-10 text-center text-gray-400">
                  Belum ada responden.
                </td>
              </tr>
            )}
            {!loading &&
              respondents.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-gray-800">{r.fullName}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-600">{r.email}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-600">{r.phone}</td>
                  <td className="px-3 py-2 text-gray-600">{r.age ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                    {r.gender ? (GENDER_LABEL[r.gender] ?? r.gender) : '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-600">{r.occupation ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-600">{r.education ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-600">{r.religion ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-600">{r.province ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-600">{r.city ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-600">{r.district ?? '—'}</td>
                  <td className="max-w-xs truncate px-3 py-2 text-gray-600" title={r.address ?? ''}>
                    {r.address ?? '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-500">{fmtDate(r.registeredAt)}</td>
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

      {!loading && respondents.length > 0 && (
        <p className="text-xs text-gray-400">Total {respondents.length} responden.</p>
      )}
    </div>
  );
}
