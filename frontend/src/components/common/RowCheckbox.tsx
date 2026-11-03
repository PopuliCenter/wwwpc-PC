/** Kotak centang tabel: area ketuk 44px di HP tanpa memperbesar tampilannya. */
export function RowCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="-m-3 flex h-11 w-11 cursor-pointer items-center justify-center lg:m-0 lg:h-auto lg:w-auto">
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 accent-primary-600"
      />
    </label>
  );
}
