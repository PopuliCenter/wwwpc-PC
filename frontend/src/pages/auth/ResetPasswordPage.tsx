import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { api } from '@/services/api';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Password dan konfirmasi password tidak cocok.');
      return;
    }

    if (password.length < 8) {
      setError('Password minimal 8 karakter.');
      return;
    }

    if (!token) {
      setError('Token reset tidak valid. Silakan minta link reset baru.');
      return;
    }

    setIsLoading(true);

    try {
      await api.post('/auth/password-reset/confirm', { token, newPassword: password });
      setIsSuccess(true);
    } catch (err: unknown) {
      const apiError = err as { message?: string };
      setError(apiError.message || 'Gagal mereset password. Token mungkin sudah expired.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Password Berhasil Direset</h2>
        <div className="p-4 rounded-md bg-green-50 border border-green-200 mb-4">
          <p className="text-sm text-green-700">
            Password Anda telah berhasil diubah. Silakan login dengan password baru.
          </p>
        </div>
        <Link
          to="/login"
          className="block text-center text-sm text-primary-600 hover:text-primary-500 font-medium"
        >
          Masuk ke akun
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-2">Reset Password</h2>
      <p className="text-sm text-gray-600 mb-6">Masukkan password baru Anda.</p>

      {error && (
        <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-200" role="alert">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Password Baru"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Minimal 8 karakter"
          required
          minLength={8}
          autoComplete="new-password"
        />

        <Input
          label="Konfirmasi Password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Ulangi password baru"
          required
          minLength={8}
          autoComplete="new-password"
        />

        <Button type="submit" isLoading={isLoading} className="w-full">
          Reset Password
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-600">
        <Link to="/login" className="text-primary-600 hover:text-primary-500 font-medium">
          Kembali ke login
        </Link>
      </p>
    </div>
  );
}
