import { useCallback, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';

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

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Konfirmasi in-app berbasis Promise — pengganti `window.confirm`, yang bisa
 * diblokir browser ("jangan tampilkan dialog lagi") atau tidak andal di WebView
 * Android. Pakai:
 *
 *   const { confirm, dialog } = useConfirm();
 *   const ok = await confirm({ message: 'Hapus?', danger: true });
 *   ... render {dialog} sekali di JSX ...
 *
 * Keyboard: fokus masuk ke tombol Batal (pilihan aman), Tab terkurung di dalam
 * dialog, Esc membatalkan, dan fokus kembali ke pemicunya saat dialog menutup.
 */
export function useConfirm() {
  const [pending, setPending] = useState<PendingState | null>(null);
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      returnFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setPending({ opts, resolve });
    });
  }, []);

  const settle = (value: boolean) => {
    pending?.resolve(value);
    setPending(null);
    returnFocusRef.current?.focus();
    returnFocusRef.current = null;
  };

  const onDialogKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      settle(false);
      return;
    }
    if (e.key !== 'Tab' || !dialogRef.current) return;
    const nodes = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    const inside = dialogRef.current.contains(active) && active !== dialogRef.current;
    if (e.shiftKey && (active === first || !inside)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !inside)) {
      e.preventDefault();
      first.focus();
    }
  };

  const dialog =
    pending &&
    createPortal(
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
        onClick={() => settle(false)}
      >
        <div
          ref={dialogRef}
          // tabIndex -1: klik pada teks dialog tidak melempar fokus ke body, jadi Esc tetap jalan.
          tabIndex={-1}
          className="w-full max-w-sm rounded-xl bg-white p-5 text-left shadow-xl"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={onDialogKeyDown}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <div className="flex items-start gap-2">
            {pending.opts.danger && (
              <AlertTriangle
                className="mt-1 h-[18px] w-[18px] shrink-0 text-danger-fg"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            )}
            <h3 id={titleId} className="min-w-0 text-lg font-semibold text-gray-900">
              {pending.opts.title ?? 'Konfirmasi'}
            </h3>
          </div>
          <div className="mt-2 whitespace-pre-line text-sm text-gray-600">
            {pending.opts.message}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="secondary" autoFocus onClick={() => settle(false)}>
              {pending.opts.cancelText ?? 'Batal'}
            </Button>
            <Button
              type="button"
              variant={pending.opts.danger ? 'danger' : 'primary'}
              onClick={() => settle(true)}
            >
              {pending.opts.confirmText ?? 'Ya, lanjutkan'}
            </Button>
          </div>
        </div>
      </div>,
      document.body,
    );

  return { confirm, dialog };
}
