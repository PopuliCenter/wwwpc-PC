import { useTapFeedback } from './Button';

interface UnderlineTabsProps<T extends string> {
  items: ReadonlyArray<{ key: T; label: string }>;
  active: T;
  onChange: (key: T) => void;
  /** Tambahan untuk wadah, mis. jarak dalam saat berada di dalam panel. */
  className?: string;
}

/**
 * Tab penyaring bergaris bawah yang bisa digeser mendatar di HP. Batang gulirnya
 * disembunyikan karena tab yang terpotong sudah menandakan masih ada lanjutannya.
 */
export function UnderlineTabs<T extends string>({
  items,
  active,
  onChange,
  className = '',
}: UnderlineTabsProps<T>) {
  const tap = useTapFeedback();
  return (
    <div
      className={`flex gap-1 overflow-x-auto border-b border-gray-200 [scrollbar-width:none] ${className}`}
    >
      {items.map((item) => {
        const isActive = active === item.key;
        return (
          <button
            key={item.key}
            type="button"
            aria-pressed={isActive}
            onClick={(e) => {
              tap(e);
              onChange(item.key);
            }}
            className={`min-h-11 shrink-0 whitespace-nowrap border-b-2 px-3 text-sm transition-colors focus-visible:-outline-offset-2 ${
              isActive
                ? 'border-primary-600 font-medium text-primary-700'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
