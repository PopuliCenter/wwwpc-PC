import { useState, useCallback, type FormEvent } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { GoogleSignInButton } from '@/components/common/GoogleSignInButton';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/services/api';
import type { LoginResponse } from '@/types';
import { AuthError, AuthHeader, OrDivider, PasswordToggle, authLinkCls } from './AuthShared';

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
      setError(apiError.message || 'Gagal masuk. Periksa email dan kata sandi Anda.');
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
        setError(apiError.message || 'Gagal masuk dengan Google. Coba lagi.');
      }
    },
    [redirectAfterLogin],
  );

  return (
    <div>
      <AuthHeader title="Masuk" subtitle="Gunakan akun Riset Populi Center Anda." />
      <AuthError message={error} />

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

        <Input
          label="Kata sandi"
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          trailingIcon={
            <PasswordToggle shown={showPassword} onToggle={() => setShowPassword((v) => !v)} />
          }
        />

        {/* Margin mengimbangi target sentuh 44px di HP agar jarak atas dan bawah teks sama. */}
        <div className="-mt-2 mb-2 flex justify-end text-sm lg:mt-0 lg:mb-4">
          <Link to="/forgot-password" className={authLinkCls}>
            Lupa kata sandi?
          </Link>
        </div>

        <Button type="submit" isLoading={isLoading} size="lg" className="w-full">
          Masuk
        </Button>
      </form>

      {/* Login Google — hanya tampil bila VITE_GOOGLE_CLIENT_ID diset */}
      {import.meta.env.VITE_GOOGLE_CLIENT_ID && (
        <>
          <OrDivider />
          <GoogleSignInButton onCredential={handleGoogleCredential} />
        </>
      )}

      <p className="mt-6 text-sm text-gray-600">
        Belum punya akun?{' '}
        <Link to="/register" className={authLinkCls}>
          Daftar
        </Link>
      </p>
    </div>
  );
}
