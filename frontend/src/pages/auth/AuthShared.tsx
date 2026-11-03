import type { ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { IconButton } from '@/components/common/IconButton';
import { Notice } from '@/components/common/Notice';
import { fieldCls } from '@/components/common/fieldStyles';

/**
 * Potongan tampilan yang sama untuk Masuk, Daftar, dan Lupa kata sandi, supaya
 * ketiganya berbahasa visual sama. Logo tidak ada di sini: AuthLayout sudah
 * menampilkannya di bawah lg, dan panel sampul menampilkannya di desktop.
 */

/** Tautan teks berdiri sendiri; min-h-11 menjaga target sentuh 44px di HP. */
export const authLinkCls =
  'inline-flex min-h-11 items-center font-medium text-primary-600 underline decoration-primary-200 underline-offset-2 hover:decoration-primary-600 lg:min-h-0';

/** Input OTP. Ukuran teks memakai `!` karena fieldCls punya text-base lg:text-sm. */
export const otpInputCls = `${fieldCls} text-center text-xl! font-semibold tabular-nums tracking-[0.4em]`;

export function AuthHeader({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-3xl">{title}</h1>
      {subtitle && <p className="mt-1.5 text-sm text-gray-600">{subtitle}</p>}
    </div>
  );
}

/** Kotak error satu bentuk di semua halaman auth. Tidak merender apa pun bila kosong. */
export function AuthError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <Notice tone="danger" role="alert" className="mb-4">
      {message}
    </Notice>
  );
}

/** Tombol tampilkan/sembunyikan kata sandi untuk slot trailingIcon pada Input. */
export function PasswordToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  const Icon = shown ? EyeOff : Eye;
  return (
    <IconButton
      aria-label={shown ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
      className="-mr-2"
      onClick={onToggle}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
    </IconButton>
  );
}

/** Pemisah "atau" di antara form dan tombol Google. */
export function OrDivider() {
  return (
    <div className="my-6 flex items-center gap-3">
      <span className="h-px flex-1 bg-gray-200" />
      <span className="text-xs text-gray-500">atau</span>
      <span className="h-px flex-1 bg-gray-200" />
    </div>
  );
}
