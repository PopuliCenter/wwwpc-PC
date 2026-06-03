import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { api } from '@/services/api';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await api.post('/auth/password-reset/request', { email });
      setIsSuccess(true);
    } catch (err: unknown) {
      const apiError = err as { message?: string };
      setError(apiError.message || 'Gagal mengirim email reset password.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Email Terkirim</h2>
        <div className="p-4 rounded-md bg-green-50 border border-green-200 mb-4">
          <p className="text-sm text-green-700">
            Jika email <strong>{email}</strong> terdaftar, Anda akan menerima link untuk mereset
            password. Silakan cek inbox Anda.
          </p>
        </div>
        <Link
          to="/login"
          className="block text-center text-sm text-primary-600 hover:text-primary-500 font-medium"
        >
          Kembali ke halaman login
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-2">Lupa Password</h2>
      <p className="text-sm text-gray-600 mb-6">
        Masukkan email Anda dan kami akan mengirimkan link untuk mereset password.
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-200" role="alert">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
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
          Kirim Link Reset
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
