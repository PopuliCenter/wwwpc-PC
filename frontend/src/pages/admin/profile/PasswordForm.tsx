import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { fieldCls } from '@/components/common/fieldStyles';
import { IconButton } from '@/components/common/IconButton';
import { Notice } from '@/components/common/Notice';

const labelClass = 'mb-1 block text-sm font-medium text-gray-700';

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggleShow: () => void;
  autoComplete: string;
  hint?: string;
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  show,
  onToggleShow,
  autoComplete,
  hint,
}: PasswordFieldProps) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${fieldCls} pr-12`}
          required
          autoComplete={autoComplete}
        />
        {/* Pembungkus yang absolute karena IconButton sendiri relative. */}
        <span className="absolute inset-y-0 right-0.5 flex items-center">
          <IconButton
            onClick={onToggleShow}
            aria-label={show ? 'Sembunyikan password' : 'Tampilkan password'}
          >
            {show ? (
              <EyeOff className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <Eye className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
            )}
          </IconButton>
        </span>
      </div>
      {hint && <p className="mt-1 text-xs text-gray-600">{hint}</p>}
    </div>
  );
}

interface PasswordFormProps {
  hasPassword: boolean;
  currentPassword: string;
  onCurrentPasswordChange: (v: string) => void;
  showCurrentPw: boolean;
  onToggleCurrentPw: () => void;
  newPassword: string;
  onNewPasswordChange: (v: string) => void;
  showNewPw: boolean;
  onToggleNewPw: () => void;
  confirmPassword: string;
  onConfirmPasswordChange: (v: string) => void;
  showConfirmPw: boolean;
  onToggleConfirmPw: () => void;
  saving: boolean;
  message: { ok: boolean; text: string } | null;
  onSubmit: (e: React.FormEvent) => void;
}

/** Form "Ganti Password" (akun berpassword) atau "Buat Password" (akun Google). */
export function PasswordForm({
  hasPassword,
  currentPassword,
  onCurrentPasswordChange,
  showCurrentPw,
  onToggleCurrentPw,
  newPassword,
  onNewPasswordChange,
  showNewPw,
  onToggleNewPw,
  confirmPassword,
  onConfirmPasswordChange,
  showConfirmPw,
  onToggleConfirmPw,
  saving,
  message,
  onSubmit,
}: PasswordFormProps) {
  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
      <h2 className="mb-4 text-base font-semibold text-gray-900">
        {hasPassword ? 'Ganti kata sandi' : 'Buat kata sandi'}
      </h2>
      {!hasPassword && (
        <Notice className="mb-4">
          Akun Anda dibuat lewat Google (belum punya password). Buat password agar bisa juga login
          dengan email &amp; password — login Google tetap berfungsi.
        </Notice>
      )}
      <div className="space-y-4">
        {hasPassword && (
          <PasswordField
            id="currentPassword"
            label="Kata sandi lama"
            value={currentPassword}
            onChange={onCurrentPasswordChange}
            show={showCurrentPw}
            onToggleShow={onToggleCurrentPw}
            autoComplete="current-password"
          />
        )}
        <PasswordField
          id="newPassword"
          label="Kata sandi baru"
          value={newPassword}
          onChange={onNewPasswordChange}
          show={showNewPw}
          onToggleShow={onToggleNewPw}
          autoComplete="new-password"
          hint="Min. 8 karakter, mengandung huruf besar, huruf kecil, angka, dan simbol."
        />
        <PasswordField
          id="confirmPassword"
          label="Konfirmasi kata sandi baru"
          value={confirmPassword}
          onChange={onConfirmPasswordChange}
          show={showConfirmPw}
          onToggleShow={onToggleConfirmPw}
          autoComplete="new-password"
        />
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button type="submit" isLoading={saving}>
          {saving ? 'Menyimpan...' : hasPassword ? 'Ganti kata sandi' : 'Buat kata sandi'}
        </Button>
        {message && (
          <span
            role={message.ok ? 'status' : 'alert'}
            className={`text-sm ${message.ok ? 'text-success-fg' : 'text-danger-fg'}`}
          >
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}
