import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type SyntheticEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { MoreHorizontal, type LucideIcon } from 'lucide-react';
import { IconButton } from './IconButton';
import { haptic } from '@/utils/haptics';

export interface RowMenuItem {
  /** Teks aksi; wajib karena isi menu selalu berteks. */
  label: string;
  /** Aksi biasa. Menu menutup dulu, baru ini dipanggil (aman untuk membuka useConfirm). */
  onClick?: () => void;
  /** Navigasi internal (react-router). */
  to?: string;
  /** Tautan biasa (unduhan atau luar aplikasi). */
  href?: string;
  target?: string;
  rel?: string;
  download?: boolean | string;
  icon?: LucideIcon;
  /** Aksi merusak: teks merah. Warna hover tetap sama seperti aksi lain. */
  destructive?: boolean;
  disabled?: boolean;
  /** Keterangan saat kursor di atas aksi; jangan jadi satu-satunya penjelasan (tak ada di HP). */
  title?: string;
}

interface RowMenuProps {
  /** Item bernilai false/null/undefined dilewati, jadi aman untuk `cond && {...}`. */
  items: Array<RowMenuItem | false | null | undefined>;
  /** aria-label tombol pemicu. */
  label?: string;
  className?: string;
}

const itemCls =
  'flex w-full min-h-11 items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ' +
  // Outline ke dalam agar tidak terpotong overflow-y-auto menu.
  'hover:bg-gray-50 focus:bg-gray-50 focus-visible:-outline-offset-2 ' +
  'disabled:pointer-events-none disabled:opacity-50 lg:min-h-9';

/**
 * Tombol "…" berisi aksi baris yang tidak muat ditampilkan langsung. Popover
 * dirender lewat portal dengan posisi fixed, jadi tidak terpotong oleh panel tabel
 * yang overflow-hidden. Mendukung keyboard (panah, Home, End, Esc) dan tidak
 * meneruskan klik ke baris yang bisa ditekan.
 *
 *   <RowMenu items={[
 *     { label: 'Duplikat', icon: Copy, onClick: duplikat },
 *     { label: 'Pratinjau', icon: Eye, to: `/admin/surveys/${id}/preview` },
 *     bolehHapus && { label: 'Hapus', icon: Trash2, destructive: true, onClick: hapus },
 *   ]} />
 */
export function RowMenu({ items, label = 'Aksi lainnya', className = '' }: RowMenuProps) {
  const visible = items.filter(Boolean) as RowMenuItem[];
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    setPos(null);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  // Posisi dihitung setelah menu terukur: rata kanan dengan tombol, membalik ke
  // atas bila tidak muat di bawah, dan selalu berada di dalam viewport.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !menuRef.current) return;
    const t = triggerRef.current.getBoundingClientRect();
    const m = menuRef.current.getBoundingClientRect();
    const gap = 4;
    const edge = 8;
    const below = t.bottom + gap;
    const top =
      below + m.height > window.innerHeight - edge && t.top - gap - m.height >= edge
        ? t.top - gap - m.height
        : below;
    const left = Math.min(Math.max(edge, t.right - m.width), window.innerWidth - m.width - edge);
    setPos({ top, left });
  }, [open]);

  // Fokus ke item pertama yang aktif begitu posisi siap.
  useEffect(() => {
    if (!pos) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
  }, [pos]);

  // Tutup saat klik/ketuk di luar, atau saat halaman bergulir/berubah ukuran
  // (posisi fixed tidak lagi menempel pada tombolnya).
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close(false);
    };
    const onViewportChange = (e: Event) => {
      if (e.target instanceof Node && menuRef.current?.contains(e.target)) return;
      close(false);
    };
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('scroll', onViewportChange, true);
    window.addEventListener('resize', onViewportChange);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('scroll', onViewportChange, true);
      window.removeEventListener('resize', onViewportChange);
    };
  }, [open, close]);

  if (visible.length === 0) return null;

  const stop = (e: SyntheticEvent) => e.stopPropagation();

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
      return;
    }
    if (e.key === 'Tab') {
      close(false);
      return;
    }
    const nodes = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [],
    );
    if (nodes.length === 0) return;
    const i = nodes.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === 'ArrowDown'
        ? (i + 1) % nodes.length
        : e.key === 'ArrowUp'
          ? (i - 1 + nodes.length) % nodes.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? nodes.length - 1
              : -1;
    if (next >= 0) {
      e.preventDefault();
      nodes[next].focus();
    }
  };

  const onItemActivate = (item: RowMenuItem) => {
    void haptic('light');
    // Pindah halaman tidak butuh fokus kembali; aksi biasa mengembalikannya ke tombol.
    close(!item.to && !item.href);
    item.onClick?.();
  };

  const renderItem = (item: RowMenuItem) => {
    const Icon = item.icon;
    const tone = item.destructive ? 'text-danger-fg' : 'text-gray-800';
    const content = (
      <>
        {Icon && (
          <Icon
            className={`h-4 w-4 shrink-0 ${item.destructive ? '' : 'text-gray-600'}`}
            strokeWidth={1.75}
            aria-hidden="true"
          />
        )}
        <span className="min-w-0 flex-1">{item.label}</span>
      </>
    );
    if (item.to && !item.disabled) {
      return (
        <Link
          key={item.label}
          to={item.to}
          role="menuitem"
          title={item.title}
          className={`${itemCls} ${tone}`}
          onClick={() => onItemActivate(item)}
        >
          {content}
        </Link>
      );
    }
    if (item.href && !item.disabled) {
      return (
        <a
          key={item.label}
          href={item.href}
          target={item.target}
          rel={item.rel}
          download={item.download}
          role="menuitem"
          title={item.title}
          className={`${itemCls} ${tone}`}
          onClick={() => onItemActivate(item)}
        >
          {content}
        </a>
      );
    }
    return (
      <button
        key={item.label}
        type="button"
        role="menuitem"
        title={item.title}
        disabled={item.disabled}
        className={`${itemCls} ${tone}`}
        onClick={() => onItemActivate(item)}
      >
        {content}
      </button>
    );
  };

  return (
    <>
      <IconButton
        ref={triggerRef}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={className}
        onClick={(e: MouseEvent<HTMLButtonElement>) => {
          e.stopPropagation();
          if (open) close(false);
          else setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <MoreHorizontal className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
      </IconButton>
      {open &&
        createPortal(
          // Event React menembus portal: hentikan agar tidak memicu baris induk.
          <div
            ref={menuRef}
            role="menu"
            aria-label={label}
            onClick={stop}
            onMouseDown={stop}
            onPointerDown={stop}
            onKeyDown={onMenuKeyDown}
            style={{
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              visibility: pos ? 'visible' : 'hidden',
            }}
            className="fixed z-[65] max-h-[calc(100dvh-16px)] w-max min-w-44 max-w-[calc(100vw-16px)] overflow-y-auto rounded-lg border border-gray-200 bg-panel py-1 shadow-lg"
          >
            {visible.map(renderItem)}
          </div>,
          document.body,
        )}
    </>
  );
}
