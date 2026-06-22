import { useCallback, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';

export interface ConfirmOptions {
  title?: string;
  /** Pesan utama (boleh multi-baris / ReactNode). */
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** Gaya tombol konfirmasi merah (operasi destruktif). */
  danger?: boolean;
}

interface PendingState {
  opts: ConfirmOptions;
  resolve: (value: boolean) => void;
}

/**
 * Konfirmasi in-app berbasis Promise — pengganti `window.confirm`, yang bisa
 * diblokir browser ("jangan tampilkan dialog lagi") atau tidak andal di WebView
 * Android. Pakai:
 *
 *   const { confirm, dialog } = useConfirm();
 *   const ok = await confirm({ message: 'Hapus?', danger: true });
 *   ... render {dialog} sekali di JSX ...
 */
export function useConfirm() {
  const [pending, setPending] = useState<PendingState | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => setPending({ opts, resolve }));
  }, []);

  const settle = (value: boolean) => {
    pending?.resolve(value);
    setPending(null);
  };

  const dialog =
    pending &&
    createPortal(
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
        onClick={() => settle(false)}
      >
        <div
          className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
          onClick={(e) => e.stopPropagation()}
          role="alertdialog"
          aria-modal="true"
        >
          <div className="flex items-start gap-3">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                pending.opts.danger ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-600'
              }`}
            >
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold text-gray-900">
                {pending.opts.title ?? 'Konfirmasi'}
              </h3>
              <div className="mt-1 whitespace-pre-line text-sm text-gray-600">
                {pending.opts.message}
              </div>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => settle(false)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              {pending.opts.cancelText ?? 'Batal'}
            </button>
            <button
              type="button"
              onClick={() => settle(true)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm ${
                pending.opts.danger
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              {pending.opts.confirmText ?? 'Ya, lanjutkan'}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );

  return { confirm, dialog };
}
