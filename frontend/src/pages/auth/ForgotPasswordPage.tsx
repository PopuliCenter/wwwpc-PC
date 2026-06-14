import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { api } from '@/services/api';

export function ForgotPasswordPage() {
  const [step, setStep] = useState<'email' | 'reset' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const requestOtp = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await api.post('/auth/password-reset/request', { email });
      setInfo(`Jika ${email} terdaftar, kode OTP telah dikirim ke email tersebut.`);
      setStep('reset');
    } catch (err: unknown) {
      const apiError = err as { message?: string };
      setError(apiError.message || 'Gagal mengirim kode OTP.');
    } finally {
      setIsLoading(false);
    }
  };

  const resendOtp = async () => {
    setError('');
    setInfo('');
    try {
      await api.post('/auth/password-reset/request', { email });
      setInfo(`Kode OTP baru telah dikirim ke ${email}.`);
    } catch (err: unknown) {
      const apiError = err as { message?: string };
      setError(apiError.message || 'Gagal mengirim ulang kode OTP.');
    }
  };

  const confirmReset = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Konfirmasi password tidak sama.');
      return;
    }
    setIsLoading(true);
    try {
      await api.post('/auth/password-reset/confirm', {
        email,
        code: code.trim(),
        newPassword: password,
      });
      setStep('done');
    } catch (err: unknown) {
      const apiError = err as { message?: string | string[] };
      const msg = Array.isArray(apiError.message) ? apiError.message.join(', ') : apiError.message;
      setError(msg || 'Gagal mereset password. Periksa kode OTP Anda.');
    } finally {
      setIsLoading(false);
    }
  };

  if (step === 'done') {
    return (
      <div>
        <h2 className="mb-4 text-xl font-semibold text-gray-900">Password Berhasil Direset</h2>
        <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-4">
          <p className="text-sm text-green-700">
            Password Anda telah diperbarui. Silakan masuk dengan password baru.
          </p>
        </div>
        <Link
          to="/login"
          className="block text-center text-sm font-medium text-primary-600 hover:text-primary-500"
        >
          Ke halaman login
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-2 text-xl font-semibold text-gray-900">Lupa Password</h2>
      <p className="mb-6 text-sm text-gray-600">
        {step === 'email'
          ? 'Masukkan email Anda, kami akan mengirim kode OTP untuk reset password.'
          : 'Masukkan kode OTP yang dikirim ke email Anda dan password baru.'}
      </p>

      {info && (
        <div className="mb-4 rounded-md border border-primary-200 bg-primary-50 p-3">
          <p className="text-sm text-primary-700">{info}</p>
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3" role="alert">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {step === 'email' ? (
        <form onSubmit={requestOtp} className="space-y-4">
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nama@email.com"
            required
            autoComplete="email"
          />
          <Button type="submit" isLoading={isLoading} className="w-full">
            Kirim Kode OTP
          </Button>
        </form>
      ) : (
        <form onSubmit={confirmReset} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Kode OTP</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="______"
              className="w-full rounded-md border border-gray-300 px-3 py-2.5 text-center text-xl font-semibold tracking-[0.4em] focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              required
            />
          </div>
          <Input
            label="Password Baru"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimal 8 karakter"
            required
            minLength={8}
            autoComplete="new-password"
            trailingIcon={
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                className="text-gray-400 transition-colors hover:text-gray-600 focus:outline-none"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
          />
          <Input
            label="Konfirmasi Password Baru"
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Ulangi password baru"
            required
            minLength={8}
            autoComplete="new-password"
            error={
              confirmPassword.length > 0 && confirmPassword !== password
                ? 'Password tidak sama'
                : undefined
            }
          />
          <Button type="submit" isLoading={isLoading} className="w-full" disabled={code.length !== 6}>
            Reset Password
          </Button>
          <button
            type="button"
            onClick={resendOtp}
            className="w-full text-center text-sm font-medium text-primary-600 hover:text-primary-500"
          >
            Kirim ulang kode
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-gray-600">
        <Link to="/login" className="font-medium text-primary-600 hover:text-primary-500">
          Kembali ke login
        </Link>
      </p>
    </div>
  );
}
