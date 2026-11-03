import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, buttonCls, useTapFeedback } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Notice } from '@/components/common/Notice';
import { api } from '@/services/api';
import { AuthError, AuthHeader, PasswordToggle, authLinkCls, otpInputCls } from './AuthShared';

export function ForgotPasswordPage() {
  const tap = useTapFeedback();
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
      setError('Konfirmasi kata sandi tidak sama.');
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
      setError(msg || 'Gagal mereset kata sandi. Periksa kode OTP Anda.');
    } finally {
      setIsLoading(false);
    }
  };

  if (step === 'done') {
    return (
      <div>
        <AuthHeader title="Kata sandi diperbarui" />
        <Notice tone="success" className="mb-4">
          Kata sandi Anda telah diperbarui. Silakan masuk dengan kata sandi baru.
        </Notice>
        <Link to="/login" onClick={tap} className={buttonCls('primary', 'lg', 'w-full')}>
          Ke halaman masuk
        </Link>
      </div>
    );
  }

  return (
    <div>
      <AuthHeader
        title="Lupa kata sandi"
        subtitle={
          step === 'email'
            ? 'Masukkan email Anda, kami akan mengirim kode OTP untuk mereset kata sandi.'
            : 'Masukkan kode OTP yang dikirim ke email Anda dan kata sandi baru.'
        }
      />

      {info && (
        <p className="mb-4 text-sm text-gray-600" role="status">
          {info}
        </p>
      )}
      <AuthError message={error} />

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
          <Button type="submit" size="lg" isLoading={isLoading} className="w-full">
            Kirim kode OTP
          </Button>
        </form>
      ) : (
        <form onSubmit={confirmReset} className="space-y-4">
          <div>
            <label htmlFor="otp-reset" className="mb-1.5 block text-sm font-medium text-gray-700">
              Kode OTP
            </label>
            <input
              id="otp-reset"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="______"
              className={otpInputCls}
              required
            />
          </div>
          <Input
            label="Kata sandi baru"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            helperText="Minimal 8 karakter."
            required
            minLength={8}
            autoComplete="new-password"
            trailingIcon={
              <PasswordToggle shown={showPassword} onToggle={() => setShowPassword((v) => !v)} />
            }
          />
          <Input
            label="Konfirmasi kata sandi baru"
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Ulangi kata sandi baru"
            required
            minLength={8}
            autoComplete="new-password"
            error={
              confirmPassword.length > 0 && confirmPassword !== password
                ? 'Kata sandi tidak sama'
                : undefined
            }
          />
          <Button
            type="submit"
            size="lg"
            isLoading={isLoading}
            className="w-full"
            disabled={code.length !== 6}
          >
            Simpan kata sandi baru
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={resendOtp}>
            Kirim ulang kode
          </Button>
        </form>
      )}

      <p className="mt-6 text-sm">
        <Link to="/login" className={authLinkCls}>
          Kembali ke halaman masuk
        </Link>
      </p>
    </div>
  );
}
