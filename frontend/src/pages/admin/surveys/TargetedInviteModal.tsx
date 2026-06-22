import { useEffect, useState } from 'react';
import { X, Users, Send, Search } from 'lucide-react';
import { api } from '@/services/api';
import { getProvinces, type WilayahItem } from '@/utils/wilayah';
import { useConfirm } from '@/components/common/ConfirmDialog';

const EDUCATIONS = ['SD', 'SMP', 'SMA/SMK', 'D1/D2/D3', 'D4/S1', 'S2', 'S3', 'Lainnya'];

interface Criteria {
  provinces?: string[];
  genders?: string[];
  educations?: string[];
  ageMin?: number;
  ageMax?: number;
  sampleSize?: number;
  perProvince?: number;
}

/**
 * Modal "Undang Bertarget" — filter responden (provinsi, gender, umur,
 * pendidikan), pratinjau jumlah cocok, opsional ambil acak N, lalu kirim undangan.
 */
export function TargetedInviteModal({
  surveyId,
  surveyTitle,
  onClose,
}: {
  surveyId: string;
  surveyTitle: string;
  onClose: () => void;
}) {
  const { confirm, dialog } = useConfirm();
  const [provincesList, setProvincesList] = useState<WilayahItem[]>([]);
  const [provinces, setProvinces] = useState<string[]>([]);
  const [genders, setGenders] = useState<string[]>([]);
  const [educations, setEducations] = useState<string[]>([]);
  const [ageMin, setAgeMin] = useState('');
  const [ageMax, setAgeMax] = useState('');
  const [sampleSize, setSampleSize] = useState('');
  const [perProvince, setPerProvince] = useState('');
  const [matching, setMatching] = useState<number | null>(null);
  const [busy, setBusy] = useState<'preview' | 'send' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    void getProvinces().then(setProvincesList).catch(() => setProvincesList([]));
  }, []);

  const toggle = (list: string[], set: (v: string[]) => void, value: string) => {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
    setMatching(null);
  };

  const buildCriteria = (): Criteria => {
    const c: Criteria = {};
    if (provinces.length) c.provinces = provinces;
    if (genders.length) c.genders = genders;
    if (educations.length) c.educations = educations;
    if (ageMin) c.ageMin = Number(ageMin);
    if (ageMax) c.ageMax = Number(ageMax);
    return c;
  };

  const handlePreview = async () => {
    setError(null);
    setDone(null);
    setBusy('preview');
    try {
      const r = await api.post<{ matching: number }>(
        `/surveys/${surveyId}/target-preview`,
        buildCriteria(),
      );
      setMatching(r.matching);
    } catch (e) {
      setError((e as Error).message || 'Gagal menghitung pratinjau.');
    } finally {
      setBusy(null);
    }
  };

  const handleSend = async () => {
    setError(null);
    const n = sampleSize ? Number(sampleSize) : undefined;
    const pp = perProvince ? Number(perProvince) : undefined;
    const target = pp
      ? `acak ${pp} per provinsi`
      : n && matching !== null
        ? `${Math.min(n, matching)}`
        : (matching ?? 'responden yang cocok');
    const ok = await confirm({
      title: 'Kirim undangan',
      message: `Kirim undangan survei "${surveyTitle}" ke ${target} responden?`,
      confirmText: 'Kirim',
      danger: false,
    });
    if (!ok) return;
    setBusy('send');
    try {
      const body = buildCriteria() as Criteria;
      if (pp) body.perProvince = pp;
      else if (n) body.sampleSize = n;
      const r = await api.post<{ recipients: number; pushed: number }>(
        `/surveys/${surveyId}/target-invite`,
        body,
      );
      setDone(
        r.recipients > 0
          ? `Undangan dikirim ke ${r.recipients} responden` +
              (r.pushed > 0 ? `, push ke ${r.pushed} perangkat.` : '.')
          : 'Tidak ada responden cocok yang belum mengisi.',
      );
    } catch (e) {
      setError((e as Error).message || 'Gagal mengirim undangan.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      {dialog}
      <div className="my-8 w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <Users className="h-5 w-5 text-primary-600" /> Undang Bertarget
          </h3>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100" aria-label="Tutup">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
          <p className="text-xs text-gray-500">
            Survei: <span className="font-medium text-gray-700">{surveyTitle}</span>.
            Kosongkan filter = tanpa batasan kriteria itu.
          </p>

          {/* Gender */}
          <div>
            <p className="mb-1.5 text-sm font-medium text-gray-700">Jenis kelamin</p>
            <div className="flex gap-4">
              {[
                { v: 'male', l: 'Laki-laki' },
                { v: 'female', l: 'Perempuan' },
              ].map(({ v, l }) => (
                <label key={v} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={genders.includes(v)}
                    onChange={() => toggle(genders, setGenders, v)}
                    className="rounded border-gray-300 text-primary-600"
                  />
                  {l}
                </label>
              ))}
            </div>
          </div>

          {/* Umur */}
          <div>
            <p className="mb-1.5 text-sm font-medium text-gray-700">Rentang umur</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                value={ageMin}
                onChange={(e) => { setAgeMin(e.target.value); setMatching(null); }}
                placeholder="Min"
                className="w-24 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              />
              <span className="text-gray-400">–</span>
              <input
                type="number"
                min={0}
                value={ageMax}
                onChange={(e) => { setAgeMax(e.target.value); setMatching(null); }}
                placeholder="Maks"
                className="w-24 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              />
              <span className="text-xs text-gray-400">tahun</span>
            </div>
          </div>

          {/* Pendidikan */}
          <div>
            <p className="mb-1.5 text-sm font-medium text-gray-700">Pendidikan</p>
            <div className="flex flex-wrap gap-2">
              {EDUCATIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => toggle(educations, setEducations, e)}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    educations.includes(e)
                      ? 'border-primary-600 bg-primary-50 text-primary-700'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* Provinsi */}
          <div>
            <p className="mb-1.5 text-sm font-medium text-gray-700">
              Provinsi {provinces.length > 0 && <span className="text-gray-400">({provinces.length} dipilih)</span>}
            </p>
            <div className="max-h-40 overflow-y-auto rounded-md border border-gray-200 p-2">
              {provincesList.length === 0 ? (
                <p className="text-xs text-gray-400">Memuat…</p>
              ) : (
                <div className="grid grid-cols-2 gap-1">
                  {provincesList.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-xs text-gray-700">
                      <input
                        type="checkbox"
                        checked={provinces.includes(p.name)}
                        onChange={() => toggle(provinces, setProvinces, p.name)}
                        className="rounded border-gray-300 text-primary-600"
                      />
                      <span className="truncate">{p.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sampling */}
          <div>
            <p className="mb-1.5 text-sm font-medium text-gray-700">
              Ambil acak total <span className="text-gray-400">(opsional)</span>
            </p>
            <input
              type="number"
              min={1}
              value={sampleSize}
              onChange={(e) => setSampleSize(e.target.value)}
              disabled={!!perProvince}
              placeholder="mis. 200 — kosong = semua yang cocok"
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>

          {/* Kuota terstratifikasi per provinsi */}
          <div>
            <p className="mb-1.5 text-sm font-medium text-gray-700">
              Atau ambil acak per provinsi <span className="text-gray-400">(opsional)</span>
            </p>
            <input
              type="number"
              min={1}
              value={perProvince}
              onChange={(e) => setPerProvince(e.target.value)}
              placeholder="mis. 100 per provinsi"
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
            <p className="mt-1 text-xs text-gray-400">
              Mengambil N acak dari TIAP provinsi yang cocok (sampel lebih merata).
              Bila diisi, menimpa "ambil acak total".
            </p>
          </div>

          {matching !== null && (
            <div className="rounded-md bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
              <strong>{matching}</strong> responden cocok & belum mengisi.
              {sampleSize && Number(sampleSize) < matching
                ? ` Akan dikirim acak ke ${sampleSize}.`
                : ''}
            </div>
          )}
          {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          {done && <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{done}</div>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button
            onClick={handlePreview}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            <Search className="h-4 w-4" /> {busy === 'preview' ? 'Menghitung…' : 'Pratinjau'}
          </button>
          <button
            onClick={handleSend}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
          >
            <Send className="h-4 w-4" /> {busy === 'send' ? 'Mengirim…' : 'Kirim Undangan'}
          </button>
        </div>
      </div>
    </div>
  );
}
