import { useState, useCallback, type FormEvent } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Mail, Lock, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { GoogleSignInButton } from '@/components/common/GoogleSignInButton';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/services/api';
import type { LoginResponse } from '@/types';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore((state) => state.login);

  // Halaman asal sebelum diarahkan ke login (mis. deep-link embed
  // /surveys/<id>/fill?embed=1). Dipakai untuk kembali ke survei yang dituju.
  const from = (location.state as { from?: { pathname: string; search?: string } } | null)?.from;

  // Arahkan setelah login berhasil sesuai peran. Responden dengan profil belum
  // lengkap akan otomatis digerbang ke /complete-profile oleh RespondentLayout.
  const redirectAfterLogin = useCallback(
    (response: LoginResponse) => {
      login(response.user, response.accessToken, response.refreshToken);
      const role = response.user.role;
      const isAdmin = role === 'admin' || role === 'super_admin';
      const redirectPath = isAdmin
        ? '/admin/dashboard'
        : from?.pathname
          ? `${from.pathname}${from.search ?? ''}`
          : '/surveys';
      navigate(redirectPath, { replace: true });
    },
    [login, navigate, from],
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await api.post<LoginResponse>('/auth/login', { email, password });
      redirectAfterLogin(response);
    } catch (err: unknown) {
      const apiError = err as { message?: string; statusCode?: number };
      setError(apiError.message || 'Login gagal. Periksa email dan password Anda.');
    } finally {
      setIsLoading(false);
    }
  };

  // Login via Google: kirim ID token ke backend → terima sesi seperti login biasa.
  const handleGoogleCredential = useCallback(
    async (idToken: string) => {
      setError('');
      try {
        const response = await api.post<LoginResponse>('/auth/google', { idToken });
        redirectAfterLogin(response);
      } catch (err: unknown) {
        const apiError = err as { message?: string };
        setError(apiError.message || 'Login Google gagal. Coba lagi.');
      }
    },
    [redirectAfterLogin],
  );

  return (
    <div>
      {/* Compact brand mark — visible mainly on mobile where the side panel is hidden */}
      <div className="mb-8">
        <img
          src="/logo-populi-center.png"
          alt="Populi Center"
          className="mb-6 h-12 w-12 object-contain lg:hidden"
        />
        <h2 className="text-2xl font-bold text-gray-900">Selamat datang kembali</h2>
        <p className="mt-1.5 text-sm text-gray-500">
          Masuk untuk melanjutkan ke panel survei Anda.
        </p>
      </div>

      {error && (
        <div
          className="mb-5 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
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
          leadingIcon={<Mail className="h-4 w-4" />}
        />

        <Input
          label="Password"
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Masukkan password"
          required
          autoComplete="current-password"
          leadingIcon={<Lock className="h-4 w-4" />}
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

        <div className="flex items-center justify-end">
          <Link
            to="/forgot-password"
            className="text-sm font-medium text-primary-600 hover:text-primary-700"
          >
            Lupa password?
          </Link>
        </div>

        <Button type="submit" isLoading={isLoading} size="lg" className="w-full">
          Masuk
        </Button>
      </form>

      {/* Login Google — hanya tampil bila VITE_GOOGLE_CLIENT_ID diset */}
      {import.meta.env.VITE_GOOGLE_CLIENT_ID && (
        <>
          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-gray-200" />
            <span className="text-xs text-gray-400">atau</span>
            <span className="h-px flex-1 bg-gray-200" />
          </div>
          <GoogleSignInButton onCredential={handleGoogleCredential} />
        </>
      )}

      <p className="mt-8 text-center text-sm text-gray-600">
        Belum punya akun?{' '}
        <Link to="/register" className="font-semibold text-primary-600 hover:text-primary-700">
          Daftar sekarang
        </Link>
      </p>
    </div>
  );
}
