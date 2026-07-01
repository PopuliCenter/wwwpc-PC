import { Lock, Eye, EyeOff } from 'lucide-react';

const inputClass =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:bg-gray-50 disabled:text-gray-500';
const labelClass = 'mb-1 block text-xs font-medium text-gray-600';

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
          className={`${inputClass} pr-10`}
          required
          autoComplete={autoComplete}
        />
        <button
          type="button"
          onClick={onToggleShow}
          aria-label={show ? 'Sembunyikan password' : 'Tampilkan password'}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
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
    <form onSubmit={onSubmit} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900">
        <Lock className="h-4 w-4 text-primary-600" />
        {hasPassword ? 'Ganti Password' : 'Buat Password'}
      </h2>
      {!hasPassword && (
        <p className="mb-4 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
          Akun Anda dibuat lewat Google (belum punya password). Buat password agar bisa juga login
          dengan email &amp; password — login Google tetap berfungsi.
        </p>
      )}
      <div className="space-y-4">
        {hasPassword && (
          <PasswordField
            id="currentPassword"
            label="Password Lama"
            value={currentPassword}
            onChange={onCurrentPasswordChange}
            show={showCurrentPw}
            onToggleShow={onToggleCurrentPw}
            autoComplete="current-password"
          />
        )}
        <PasswordField
          id="newPassword"
          label="Password Baru"
          value={newPassword}
          onChange={onNewPasswordChange}
          show={showNewPw}
          onToggleShow={onToggleNewPw}
          autoComplete="new-password"
          hint="Min. 8 karakter, mengandung huruf besar, huruf kecil, angka, dan simbol."
        />
        <PasswordField
          id="confirmPassword"
          label="Konfirmasi Password Baru"
          value={confirmPassword}
          onChange={onConfirmPasswordChange}
          show={showConfirmPw}
          onToggleShow={onToggleConfirmPw}
          autoComplete="new-password"
        />
      </div>
      <div className="mt-5 flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
        >
          {saving ? 'Menyimpan...' : hasPassword ? 'Ganti Password' : 'Buat Password'}
        </button>
        {message && (
          <span className={`text-sm ${message.ok ? 'text-emerald-600' : 'text-red-600'}`}>
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}
