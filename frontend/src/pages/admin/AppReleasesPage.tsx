import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Megaphone, Rocket, Trash2 } from 'lucide-react';
import { api } from '@/services/api';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { useConfirm } from '@/components/common/ConfirmDialog';
import { Notice } from '@/components/common/Notice';
import { fieldCls, textareaCls } from '@/components/common/fieldStyles';

/** Link listing Google Play app ini — dipakai setelah app rilis di Play. */
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.populicenter.survei';
const DEFAULT_DOWNLOAD_URL = 'https://populicenter.org/';

interface AppRelease {
  id: string;
  platform: string;
  versionCode: number;
  versionName: string;
  downloadUrl: string;
  releaseNotes: string | null;
  forceUpdate: boolean;
  notifiedAt: string | null;
  createdAt: string;
}

interface AnnounceResult {
  recipients: number;
  pushed: number;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

function announcedText(r: AnnounceResult): string {
  return `diumumkan ke ${r.recipients} pengguna Android (lonceng), ${r.pushed} push terkirim`;
}

/**
 * Rilis aplikasi Android: catat versi baru supaya app responden menampilkan
 * "Versi baru tersedia" (atau layar wajib update), lalu umumkan lewat lonceng
 * + push. Angka kode/nama versi = appVersionCode/appVersionName di
 * frontend/android/app/build.gradle untuk APK yang diunggah.
 */
export function AppReleasesPage() {
  const { confirm, dialog } = useConfirm();
  const [items, setItems] = useState<AppRelease[]>([]);
  const [allowedHosts, setAllowedHosts] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [versionCode, setVersionCode] = useState('');
  const [versionName, setVersionName] = useState('');
  const [downloadUrl, setDownloadUrl] = useState(DEFAULT_DOWNLOAD_URL);
  const [releaseNotes, setReleaseNotes] = useState('');
  const [forceUpdate, setForceUpdate] = useState(false);
  const [notify, setNotify] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ items: AppRelease[]; allowedHosts: string[] }>(
        '/admin/app-releases',
      );
      setItems(res.items);
      setAllowedHosts(res.allowedHosts);
      setLoadError(null);
      const latest = res.items.find((r) => r.platform === 'android');
      if (latest) {
        setVersionCode((v) => v || String(latest.versionCode + 1));
        setDownloadUrl((u) => (u === DEFAULT_DOWNLOAD_URL ? latest.downloadUrl : u));
      }
    } catch (err: unknown) {
      setLoadError((err as { message?: string }).message || 'Gagal memuat daftar rilis.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const latestId = items.find((r) => r.platform === 'android')?.id;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    const code = Number(versionCode);
    if (!Number.isInteger(code) || code < 1) {
      setError('Kode versi harus bilangan bulat ≥ 1 (sama dengan appVersionCode di build.gradle).');
      return;
    }
    if (!versionName.trim() || !downloadUrl.trim()) {
      setError('Nama versi dan link unduhan wajib diisi.');
      return;
    }
    const ok = await confirm({
      title: forceUpdate ? 'Catat rilis WAJIB update' : 'Catat rilis baru',
      message:
        `Versi ${versionName.trim()} (kode ${code}).` +
        (forceUpdate
          ? '\nApp dengan versi lebih lama akan DIBLOKIR sampai diperbarui. Pastikan APK baru sudah bisa diunduh di link tersebut.'
          : '\nPengguna versi lama melihat tawaran "Versi baru tersedia".') +
        (notify ? '\nPengumuman (lonceng + push) langsung dikirim ke pengguna Android.' : ''),
      confirmText: 'Catat rilis',
      danger: forceUpdate,
    });
    if (!ok) return;

    setSubmitting(true);
    try {
      const res = await api.post<{ release: AppRelease; announced: AnnounceResult | null }>(
        '/admin/app-releases',
        {
          versionCode: code,
          versionName: versionName.trim(),
          downloadUrl: downloadUrl.trim(),
          releaseNotes: releaseNotes.trim() || undefined,
          forceUpdate,
          notify,
        },
      );
      setResult(
        `Rilis v${res.release.versionName} tercatat` +
          (res.announced ? ` dan ${announcedText(res.announced)}.` : '.'),
      );
      setVersionCode(String(res.release.versionCode + 1));
      setVersionName('');
      setReleaseNotes('');
      setForceUpdate(false);
      await load();
    } catch (err: unknown) {
      setError((err as { message?: string }).message || 'Gagal mencatat rilis.');
    } finally {
      setSubmitting(false);
    }
  };

  const announce = async (r: AppRelease) => {
    const ok = await confirm({
      title: 'Umumkan rilis',
      message: `Kirim lagi pengumuman v${r.versionName} (lonceng + push) ke semua pengguna Android?`,
      confirmText: 'Umumkan',
    });
    if (!ok) return;
    setBusyId(r.id);
    setError(null);
    setResult(null);
    try {
      const res = await api.post<AnnounceResult>(`/admin/app-releases/${r.id}/announce`);
      setResult(`Rilis v${r.versionName} ${announcedText(res)}.`);
      await load();
    } catch (err: unknown) {
      setError((err as { message?: string }).message || 'Gagal mengumumkan rilis.');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (r: AppRelease) => {
    const ok = await confirm({
      title: 'Hapus rilis',
      message:
        `Hapus catatan rilis v${r.versionName} (kode ${r.versionCode})?` +
        (r.forceUpdate
          ? '\nVersi minimum wajib update ikut turun ke rilis wajib sebelumnya.'
          : '') +
        '\nAPK yang sudah terpasang di HP pengguna tidak terpengaruh.',
      confirmText: 'Hapus',
      danger: true,
    });
    if (!ok) return;
    setBusyId(r.id);
    setError(null);
    setResult(null);
    try {
      await api.delete(`/admin/app-releases/${r.id}`);
      setResult(`Catatan rilis v${r.versionName} dihapus.`);
      await load();
    } catch (err: unknown) {
      setError((err as { message?: string }).message || 'Gagal menghapus rilis.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {dialog}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Rilis Aplikasi</h1>
        <p className="mt-1 text-sm text-gray-600">
          Catat versi APK Android terbaru. App responden yang lebih lama menampilkan “Versi baru
          tersedia”; rilis bertanda wajib update memblokir versi lama sampai diperbarui. Versi web
          selalu terbaru dan tidak terpengaruh.
        </p>
      </div>

      {result && (
        <Notice tone="success" role="status">
          {result}
        </Notice>
      )}
      {error && (
        <Notice tone="danger" role="alert">
          {error}
        </Notice>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-gray-200 bg-panel p-5"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="releaseCode" className="mb-1 block text-sm font-medium text-gray-700">
              Kode versi
            </label>
            <input
              id="releaseCode"
              type="number"
              inputMode="numeric"
              min={1}
              value={versionCode}
              onChange={(e) => setVersionCode(e.target.value)}
              placeholder="Contoh: 2"
              className={fieldCls}
            />
            <p className="mt-1 text-xs text-gray-600">= appVersionCode di build.gradle.</p>
          </div>
          <div>
            <label htmlFor="releaseName" className="mb-1 block text-sm font-medium text-gray-700">
              Nama versi
            </label>
            <input
              id="releaseName"
              type="text"
              value={versionName}
              onChange={(e) => setVersionName(e.target.value)}
              maxLength={40}
              placeholder="Contoh: 1.1.0"
              className={fieldCls}
            />
            <p className="mt-1 text-xs text-gray-600">= appVersionName, dilihat pengguna.</p>
          </div>
        </div>

        <div>
          <label htmlFor="releaseUrl" className="mb-1 block text-sm font-medium text-gray-700">
            Link unduhan
          </label>
          <input
            id="releaseUrl"
            type="url"
            value={downloadUrl}
            onChange={(e) => setDownloadUrl(e.target.value)}
            maxLength={500}
            className={fieldCls}
          />
          <p className="mt-1 text-xs text-gray-600">
            Halaman unduhan di website resmi, atau listing Google Play setelah app rilis di Play
            (app langsung membuka Play Store).
            {allowedHosts.length > 0 && <> Domain yang diizinkan: {allowedHosts.join(', ')}.</>}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setDownloadUrl(DEFAULT_DOWNLOAD_URL)}
            >
              Website populicenter.org
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setDownloadUrl(PLAY_STORE_URL)}
            >
              Google Play
            </Button>
          </div>
        </div>

        <div>
          <label htmlFor="releaseNotes" className="mb-1 block text-sm font-medium text-gray-700">
            Yang baru <span className="font-normal text-gray-500">(opsional)</span>
          </label>
          <textarea
            id="releaseNotes"
            value={releaseNotes}
            onChange={(e) => setReleaseNotes(e.target.value)}
            maxLength={2000}
            rows={4}
            placeholder="Contoh: Perbaikan pengisian survei saat offline."
            className={textareaCls}
          />
        </div>

        <label className="flex min-h-11 items-start gap-2 text-sm text-gray-700 lg:min-h-0">
          <input
            type="checkbox"
            checked={forceUpdate}
            onChange={(e) => setForceUpdate(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-primary-600"
          />
          <span>
            Wajib update — versi lama diblokir sampai diperbarui. Pakai bila ada perbaikan di sisi
            aplikasi yang harus dipasang semua pengguna.
          </span>
        </label>

        <label className="flex min-h-11 items-center gap-2 text-sm text-gray-700 lg:min-h-0">
          <input
            type="checkbox"
            checked={notify}
            onChange={(e) => setNotify(e.target.checked)}
            className="h-4 w-4 shrink-0 accent-primary-600"
          />
          Umumkan sekarang ke pengguna Android (lonceng + push)
        </label>

        <Button type="submit" disabled={submitting}>
          <Rocket className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          {submitting ? 'Menyimpan…' : 'Catat Rilis'}
        </Button>
      </form>

      <section className="rounded-xl border border-gray-200 bg-panel">
        <h2 className="border-b border-gray-200 px-5 py-3 text-base font-semibold text-gray-900">
          Riwayat rilis
        </h2>
        {loadError && (
          <div className="p-5">
            <Notice tone="danger" role="alert">
              {loadError}
            </Notice>
          </div>
        )}
        {!loadError && items.length === 0 && (
          <p className="px-5 py-6 text-sm text-gray-600">
            Belum ada rilis tercatat. App tidak menampilkan tawaran update sampai rilis pertama
            dicatat.
          </p>
        )}
        <ul className="divide-y divide-gray-200">
          {items.map((r) => (
            <li key={r.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium text-gray-900">
                  v{r.versionName}{' '}
                  <span className="font-normal tabular-nums text-gray-500">
                    (kode {r.versionCode})
                  </span>
                </p>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  {r.id === latestId && <Badge tone="active">Terbaru</Badge>}
                  {r.forceUpdate && <Badge tone="warning">Wajib update</Badge>}
                  <Badge tone="muted">
                    {r.notifiedAt ? `Diumumkan ${formatDateTime(r.notifiedAt)}` : 'Belum diumumkan'}
                  </Badge>
                </div>
                <p className="mt-1 break-all text-gray-600">{r.downloadUrl}</p>
                {r.releaseNotes && (
                  <p className="mt-1 whitespace-pre-line text-gray-700">{r.releaseNotes}</p>
                )}
                <p className="mt-1 text-xs text-gray-500">Dicatat {formatDateTime(r.createdAt)}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                {r.id === latestId && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={busyId === r.id}
                    onClick={() => void announce(r)}
                  >
                    <Megaphone className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    Umumkan
                  </Button>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busyId === r.id}
                  onClick={() => void remove(r)}
                  aria-label={`Hapus rilis v${r.versionName}`}
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  Hapus
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
