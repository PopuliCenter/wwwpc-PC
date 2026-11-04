/**
 * Satu bentuk kontrol form untuk input, select, dan textarea. Kontrol jangan
 * diletakkan di atas gray-200 (batas gray-300 tidak lagi 3:1 di sana).
 *
 * Varian invalid dan textarea adalah string utuh, bukan tambahan: kelas Tailwind
 * yang bentrok (border-*, h-*) dimenangkan urutan CSS, bukan urutan di className.
 */
const shared =
  'w-full rounded-lg border bg-panel px-3 text-base lg:text-sm text-gray-900 ' +
  'placeholder:text-gray-400 focus:outline-none focus:ring-2 ' +
  'disabled:bg-gray-100 disabled:text-gray-500';

const single = 'h-11 lg:h-10';
const multi = 'h-auto py-2.5';
const valid = 'border-gray-300 focus:border-primary-600 focus:ring-primary-500/30';
const invalid = 'border-danger-fg focus:border-danger-fg focus:ring-danger-fg/20';

/** Input dan select normal. */
export const fieldCls = `${shared} ${single} ${valid}`;
/** Input dan select tidak valid. Pakai sebagai pengganti fieldCls, bukan tambahan. */
export const fieldInvalidCls = `${shared} ${single} ${invalid}`;
/** Textarea normal. */
export const textareaCls = `${shared} ${multi} ${valid}`;
/** Textarea tidak valid. Pakai sebagai pengganti textareaCls, bukan tambahan. */
export const textareaInvalidCls = `${shared} ${multi} ${invalid}`;

/** Memilih kelas yang tepat bila status invalid atau jenis kontrol dinamis. */
export function fieldClass({
  invalid: isInvalid = false,
  multiline = false,
}: { invalid?: boolean; multiline?: boolean } = {}): string {
  if (multiline) return isInvalid ? textareaInvalidCls : textareaCls;
  return isInvalid ? fieldInvalidCls : fieldCls;
}
