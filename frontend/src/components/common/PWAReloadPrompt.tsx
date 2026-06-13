import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';

/**
 * Banner pemberitahuan update PWA (mode 'prompt'). Saat versi baru aplikasi
 * tersedia, pengguna diberi tahu dan memilih memuat ulang — sehingga selalu
 * sadar melihat perubahan terbaru (penting saat pra-produksi).
 */
export function PWAReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[100] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-xl border border-primary-200 bg-white p-3 shadow-lg">
        <RefreshCw className="h-5 w-5 shrink-0 text-primary-600" />
        <p className="flex-1 text-sm text-gray-700">
          Versi baru aplikasi tersedia.
        </p>
        <button
          onClick={() => updateServiceWorker(true)}
          className="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
        >
          Muat ulang
        </button>
        <button
          onClick={() => setNeedRefresh(false)}
          aria-label="Tutup"
          className="text-gray-400 hover:text-gray-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
