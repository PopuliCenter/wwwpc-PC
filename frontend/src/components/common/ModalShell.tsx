import type { ReactNode } from 'react';

interface ModalShellProps {
  /** Nama dialog untuk pembaca layar. */
  label: string;
  /** Bila diisi, klik di luar panel menutup dialog. Kosongkan untuk form yang panjang. */
  onClose?: () => void;
  maxWidth?: string;
  children: ReactNode;
}

/**
 * Lapisan gelap + panel untuk dialog yang isinya panjang: halaman bergulir bersama
 * panel, jadi isinya tetap terjangkau di HP. Kepala dan isi diatur oleh pemakainya.
 */
export function ModalShell({ label, onClose, maxWidth = 'max-w-2xl', children }: ModalShellProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`my-6 w-full rounded-xl bg-white shadow-xl ${maxWidth}`}
        onClick={onClose ? (e) => e.stopPropagation() : undefined}
      >
        {children}
      </div>
    </div>
  );
}
