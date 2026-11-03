import { useTapFeedback } from './Button';

interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<{ key: T; label: string }>;
  value: T;
  onChange: (key: T) => void;
  /** Nama kelompok untuk pembaca layar. */
  label?: string;
  /** Tinggi dan jarak tiap segmen; bawaan setinggi input di sebelahnya. */
  itemClassName?: string;
}

/** Pilihan satu dari sedikit opsi yang langsung berlaku, mis. rentang waktu atau bucket. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  itemClassName = 'min-h-11 px-3 lg:min-h-10',
}: SegmentedControlProps<T>) {
  const tap = useTapFeedback();
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex overflow-hidden rounded-lg border border-gray-300 bg-white"
    >
      {options.map(({ key, label: optionLabel }) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={(e) => {
            tap(e);
            onChange(key);
          }}
          className={`whitespace-nowrap border-l border-gray-300 text-sm font-medium transition-colors first:border-l-0 focus-visible:-outline-offset-2 ${itemClassName} ${
            value === key ? 'bg-primary-50 text-primary-700' : 'text-gray-700 hover:bg-gray-50'
          }`}
        >
          {optionLabel}
        </button>
      ))}
    </div>
  );
}
