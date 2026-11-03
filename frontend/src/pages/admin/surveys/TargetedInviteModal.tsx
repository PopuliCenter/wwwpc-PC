import { useEffect, useState } from 'react';
import { X, Send, Search } from 'lucide-react';
import { api } from '@/services/api';
import { getProvinces, type WilayahItem } from '@/utils/wilayah';
import { useConfirm } from '@/components/common/ConfirmDialog';
import { Button, useTapFeedback } from '@/components/common/Button';
import { IconButton } from '@/components/common/IconButton';
import { ModalShell } from '@/components/common/ModalShell';
import { Notice } from '@/components/common/Notice';
import { fieldCls } from '@/components/common/fieldStyles';

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
  const tap = useTapFeedback();
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
    void getProvinces()
      .then(setProvincesList)
      .catch(() => setProvincesList([]));
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
    <ModalShell label="Undang Bertarget" maxWidth="max-w-lg">
      {dialog}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2 sm:px-5">
        <h3 className="text-base font-semibold text-gray-900">Undang Bertarget</h3>
        <IconButton aria-label="Tutup" onClick={onClose}>
          <X className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </IconButton>
      </div>

      <div className="max-h-[70vh] space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
        <p className="text-xs text-gray-600">
          Survei: <span className="font-medium text-gray-800">{surveyTitle}</span>. Kosongkan filter
          = tanpa batasan kriteria itu.
        </p>

        {/* Gender */}
        <div>
          <p className="mb-1.5 text-sm font-medium text-gray-700">Jenis kelamin</p>
          <div className="flex flex-wrap gap-x-4">
            {[
              { v: 'male', l: 'Laki-laki' },
              { v: 'female', l: 'Perempuan' },
            ].map(({ v, l }) => (
              <label
                key={v}
                className="flex min-h-11 items-center gap-2 text-sm text-gray-700 lg:min-h-0"
              >
                <input
                  type="checkbox"
                  checked={genders.includes(v)}
                  onChange={() => toggle(genders, setGenders, v)}
                  className="h-4 w-4 shrink-0 accent-primary-600"
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
            <div className="w-24">
              <input
                type="number"
                min={0}
                aria-label="Umur minimal"
                value={ageMin}
                onChange={(e) => {
                  setAgeMin(e.target.value);
                  setMatching(null);
                }}
                placeholder="Min"
                className={fieldCls}
              />
            </div>
            <span className="text-gray-500">–</span>
            <div className="w-24">
              <input
                type="number"
                min={0}
                aria-label="Umur maksimal"
                value={ageMax}
                onChange={(e) => {
                  setAgeMax(e.target.value);
                  setMatching(null);
                }}
                placeholder="Maks"
                className={fieldCls}
              />
            </div>
            <span className="text-xs text-gray-600">tahun</span>
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
                aria-pressed={educations.includes(e)}
                onClick={(ev) => {
                  tap(ev);
                  toggle(educations, setEducations, e);
                }}
                className={`min-h-11 rounded-lg border px-3 text-sm transition-colors lg:min-h-9 ${
                  educations.includes(e)
                    ? 'border-primary-600 bg-primary-50 font-medium text-primary-700'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
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
            Provinsi{' '}
            {provinces.length > 0 && (
              <span className="font-normal text-gray-500">({provinces.length} dipilih)</span>
            )}
          </p>
          <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 p-2">
            {provincesList.length === 0 ? (
              <p className="text-xs text-gray-500">Memuat…</p>
            ) : (
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {provincesList.map((p) => (
                  <label
                    key={p.id}
                    className="flex min-h-11 items-center gap-2 text-sm text-gray-700 lg:min-h-0 lg:text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={provinces.includes(p.name)}
                      onChange={() => toggle(provinces, setProvinces, p.name)}
                      className="h-4 w-4 shrink-0 accent-primary-600"
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
            Ambil acak total <span className="font-normal text-gray-500">(opsional)</span>
          </p>
          <input
            type="number"
            min={1}
            value={sampleSize}
            onChange={(e) => setSampleSize(e.target.value)}
            disabled={!!perProvince}
            placeholder="mis. 200 — kosong = semua yang cocok"
            className={fieldCls}
          />
        </div>

        {/* Kuota terstratifikasi per provinsi */}
        <div>
          <p className="mb-1.5 text-sm font-medium text-gray-700">
            Atau ambil acak per provinsi{' '}
            <span className="font-normal text-gray-500">(opsional)</span>
          </p>
          <input
            type="number"
            min={1}
            value={perProvince}
            onChange={(e) => setPerProvince(e.target.value)}
            placeholder="mis. 100 per provinsi"
            className={fieldCls}
          />
          <p className="mt-1 text-xs text-gray-600">
            Mengambil N acak dari TIAP provinsi yang cocok (sampel lebih merata). Bila diisi,
            menimpa "ambil acak total".
          </p>
        </div>

        {matching !== null && (
          <Notice>
            <strong className="tabular-nums">{matching}</strong> responden cocok & belum mengisi.
            {sampleSize && Number(sampleSize) < matching
              ? ` Akan dikirim acak ke ${sampleSize}.`
              : ''}
          </Notice>
        )}
        {error && (
          <Notice tone="danger" role="alert">
            {error}
          </Notice>
        )}
        {done && (
          <Notice tone="success" role="status">
            {done}
          </Notice>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 px-4 py-3 sm:px-5">
        <Button
          type="button"
          variant="secondary"
          onClick={handlePreview}
          disabled={busy !== null}
          isLoading={busy === 'preview'}
        >
          {busy !== 'preview' && (
            <Search className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          )}
          {busy === 'preview' ? 'Menghitung…' : 'Pratinjau'}
        </Button>
        <Button
          type="button"
          onClick={handleSend}
          disabled={busy !== null}
          isLoading={busy === 'send'}
        >
          {busy !== 'send' && <Send className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
          {busy === 'send' ? 'Mengirim…' : 'Kirim Undangan'}
        </Button>
      </div>
    </ModalShell>
  );
}
