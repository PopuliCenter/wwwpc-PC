import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Download } from 'lucide-react';
import { Logo } from '@/components/common/Logo';
import { Button } from '@/components/common/Button';
import { Notice } from '@/components/common/Notice';
import {
  type AppVersionInfo,
  type UpdateStatus,
  evaluateUpdate,
  fetchAppVersion,
  getNativeVersionCode,
  isSafeDownloadUrl,
  loadCachedInfo,
  nativeUpdatePlatform,
  openDownloadUrl,
} from '@/services/appUpdate';
import { getAppVersion } from '@/utils/appVersion';

/**
 * Halaman tujuan notifikasi "versi baru aplikasi" (lonceng & push → /app-update).
 * Publik (tanpa login) supaya tetap terbuka walau sesi sudah habis.
 *
 * - App Android: tampilkan versi terpasang vs terbaru + tombol Perbarui.
 * - Web: selalu versi terbaru; tawarkan unduh app Android bila ada link.
 */
export function AppUpdatePage() {
  const navigate = useNavigate();
  const platform = nativeUpdatePlatform();
  const [info, setInfo] = useState<AppVersionInfo | null>(() => loadCachedInfo());
  const [status, setStatus] = useState<UpdateStatus>('none');
  const [installed, setInstalled] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const [label, code] = await Promise.all([getAppVersion(), getNativeVersionCode()]);
      if (!active) return;
      setInstalled(label);
      try {
        const fresh = await fetchAppVersion('android');
        if (!active) return;
        setInfo(fresh);
        setStatus(evaluateUpdate(code, fresh));
      } catch {
        if (!active) return;
        setError(true);
        setStatus(evaluateUpdate(code, loadCachedInfo()));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/surveys');
  };

  const canDownload = isSafeDownloadUrl(info?.downloadUrl);

  return (
    <div className="min-h-screen bg-surface">
      <main className="mx-auto max-w-md px-4 py-8">
        <div className="flex items-center gap-2.5">
          <Logo size={40} alt="" />
          <p className="text-sm font-semibold text-gray-900">Populi Center</p>
        </div>
        <h1 className="mt-6 text-2xl">Pembaruan Aplikasi</h1>

        <section className="mt-5 space-y-4 rounded-xl border border-gray-200 bg-panel p-5 text-sm text-gray-700">
          {platform ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-gray-500">Versi terpasang</dt>
              <dd className="tabular-nums text-gray-900">{installed || '—'}</dd>
              <dt className="text-gray-500">Versi terbaru</dt>
              <dd className="tabular-nums text-gray-900">
                {loading && !info ? 'Memeriksa…' : (info?.latestVersionName ?? '—')}
              </dd>
            </dl>
          ) : (
            <p>
              Anda memakai Populi versi web, yang selalu diperbarui otomatis. Pembaruan ini untuk
              aplikasi Android.
            </p>
          )}

          {error && (
            <Notice tone="warning" role="status">
              Tidak bisa memeriksa versi terbaru. Periksa koneksi internet lalu buka lagi halaman
              ini.
            </Notice>
          )}

          {platform && !loading && status === 'none' && !error && (
            <p className="flex items-center gap-2 text-gray-900">
              <CheckCircle2
                className="h-5 w-5 text-success-fg"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              Aplikasi Anda sudah versi terbaru.
            </p>
          )}

          {platform && status === 'required' && (
            <Notice tone="danger" role="alert">
              Versi Anda sudah tidak didukung. Perbarui untuk melanjutkan.
            </Notice>
          )}

          {info?.releaseNotes && (status !== 'none' || !platform) && (
            <div>
              <p className="font-medium text-gray-900">Yang baru</p>
              <p className="mt-1 whitespace-pre-line">{info.releaseNotes}</p>
            </div>
          )}

          {canDownload && (status !== 'none' || !platform) && (
            <Button
              type="button"
              className="w-full"
              onClick={() => openDownloadUrl(info?.downloadUrl)}
            >
              <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              {platform ? 'Perbarui sekarang' : 'Unduh aplikasi Android'}
            </Button>
          )}
        </section>

        <Button type="button" variant="secondary" className="mt-4" onClick={goBack}>
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Kembali
        </Button>
      </main>
    </div>
  );
}
