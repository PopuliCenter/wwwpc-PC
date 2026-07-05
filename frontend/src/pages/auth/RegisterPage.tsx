import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { WilayahPicker } from '@/components/common/WilayahPicker';
import { GoogleSignInButton } from '@/components/common/GoogleSignInButton';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/services/api';
import type { UserRole, LoginResponse } from '@/types';

interface RegisterResult {
  userId: string;
  email: string;
  message: string;
  requiresOtp: boolean;
}

interface VerifyResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; fullName: string; role: UserRole };
}

const selectCls =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20';

/** Hitung usia (tahun penuh) dari tanggal lahir ISO, atau null bila kosong/invalid. */
function ageFromDob(dob: string): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

const TODAY_ISO = new Date().toISOString().slice(0, 10);

export function RegisterPage() {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);

  // Akun
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  // Data diri
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('');
  const [occupation, setOccupation] = useState('');
  const [education, setEducation] = useState('');
  const [religion, setReligion] = useState('');
  const [wilayah, setWilayah] = useState({ province: '', city: '', district: '' });
  const [address, setAddress] = useState('');
  // Alur
  const [step, setStep] = useState<'account' | 'profile' | 'otp'>('account');
  const [otp, setOtp] = useState('');
  const [otpInfo, setOtpInfo] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Cooldown "Kirim ulang kode" (detik) agar tak menekan berulang → rate-limit.
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const goToProfile = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Konfirmasi password tidak sama.');
      return;
    }
    setStep('profile');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const computedAge = ageFromDob(dateOfBirth);
    if (computedAge === null) {
      setError('Masukkan tanggal lahir yang valid.');
      return;
    }
    if (computedAge < 13) {
      setError('Usia minimal 13 tahun untuk mendaftar.');
      return;
    }
    if (!wilayah.province || !wilayah.city || !wilayah.district) {
      setError('Lengkapi provinsi, kabupaten/kota, dan kecamatan.');
      return;
    }
    setIsLoading(true);
    try {
      await api.post<RegisterResult>('/registration/register', {
        fullName,
        email,
        phone,
        password,
        termsAccepted: acceptTerms,
        dateOfBirth,
        gender,
        occupation,
        education,
        religion,
        province: wilayah.province,
        city: wilayah.city,
        district: wilayah.district,
        address,
      });
      setOtpInfo(`Kode OTP telah dikirim ke ${email}.`);
      setStep('otp');
      setResendCooldown(60);
    } catch (err: unknown) {
      const apiError = err as { message?: string | string[] };
      const msg = Array.isArray(apiError.message) ? apiError.message.join(', ') : apiError.message;
      setError(msg || 'Registrasi gagal. Silakan coba lagi.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const res = await api.post<VerifyResult>('/registration/verify-otp', {
        email,
        code: otp.trim(),
      });
      login(
        {
          id: res.user.id,
          email: res.user.email,
          fullName: res.user.fullName,
          role: res.user.role,
          isActive: true,
        },
        res.accessToken,
        res.refreshToken,
      );
      navigate('/surveys');
    } catch (err: unknown) {
      const apiError = err as { message?: string | string[] };
      const msg = Array.isArray(apiError.message) ? apiError.message.join(', ') : apiError.message;
      setError(msg || 'Verifikasi gagal. Periksa kode OTP Anda.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || resending) return;
    setError('');
    setOtpInfo('');
    setResending(true);
    try {
      await api.post('/registration/resend-otp', { email });
      setOtpInfo(`Kode OTP baru telah dikirim ke ${email}. Cek juga folder spam.`);
      setResendCooldown(60);
    } catch (err: unknown) {
      const apiError = err as { message?: string };
      setError(apiError.message || 'Gagal mengirim ulang OTP.');
    } finally {
      setResending(false);
    }
  };

  // Daftar/masuk via Google: backend membuat akun responden baru bila email belum
  // terdaftar, lalu langsung memberi sesi (tanpa OTP — Google sudah verifikasi).
  const handleGoogleCredential = useCallback(
    async (idToken: string) => {
      setError('');
      try {
        const res = await api.post<LoginResponse>('/auth/google', { idToken });
        login(res.user, res.accessToken, res.refreshToken);
        navigate('/surveys');
      } catch (err: unknown) {
        const apiError = err as { message?: string };
        setError(apiError.message || 'Daftar dengan Google gagal. Coba lagi.');
      }
    },
    [login, navigate],
  );

  const Header = ({ title, subtitle }: { title: string; subtitle: string }) => (
    <div className="mb-6 flex flex-col items-center">
      <img
        src="/logo-populi-center.png"
        alt="Populi Center"
        className="mb-2 h-14 w-14 object-contain"
      />
      <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
      <p className="mt-1 text-center text-sm text-gray-500">{subtitle}</p>
    </div>
  );

  const ErrorBox = () =>
    error ? (
      <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3" role="alert">
        <p className="text-sm text-red-700">{error}</p>
      </div>
    ) : null;

  // ── Langkah 3: OTP ──────────────────────────────────────────────────────────
  if (step === 'otp') {
    return (
      <div>
        <Header
          title="Verifikasi Email"
          subtitle="Masukkan 6 digit kode yang dikirim ke email Anda."
        />
        {otpInfo && (
          <div className="mb-4 rounded-md border border-primary-200 bg-primary-50 p-3 text-sm text-primary-700">
            {otpInfo}
          </div>
        )}
        <ErrorBox />
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <label htmlFor="otp-register" className="block text-sm font-medium text-gray-700">
            Kode OTP (6 digit)
          </label>
          <input
            id="otp-register"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="______"
            aria-label="Kode OTP 6 digit"
            className="w-full rounded-md border border-gray-300 px-3 py-3 text-center text-2xl font-semibold tracking-[0.5em] focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            required
          />
          <Button
            type="submit"
            isLoading={isLoading}
            className="w-full"
            disabled={otp.length !== 6}
          >
            Verifikasi
          </Button>
        </form>
        <div className="mt-4 flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={handleResendOtp}
            disabled={resendCooldown > 0 || resending}
            className="font-medium text-primary-600 hover:text-primary-500 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:text-gray-400"
          >
            {resending
              ? 'Mengirim…'
              : resendCooldown > 0
                ? `Kirim ulang dalam ${resendCooldown}s`
                : 'Kirim ulang kode'}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep('profile');
              setOtp('');
              setError('');
            }}
            className="text-gray-500 hover:text-gray-700"
          >
            Kembali
          </button>
        </div>
      </div>
    );
  }

  // ── Langkah 2: Data Diri ────────────────────────────────────────────────────
  if (step === 'profile') {
    return (
      <div>
        <Header title="Data Diri" subtitle="Langkah 2 dari 2 — lengkapi data demografi Anda." />
        <ErrorBox />
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Input
                label="Tanggal Lahir"
                type="date"
                max={TODAY_ISO}
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                required
              />
              {ageFromDob(dateOfBirth) !== null && (
                <p className="mt-1 text-xs text-gray-500">Usia: {ageFromDob(dateOfBirth)} tahun</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Jenis Kelamin</label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                required
                className={selectCls}
              >
                <option value="" disabled>
                  Pilih…
                </option>
                <option value="male">Laki-laki</option>
                <option value="female">Perempuan</option>
              </select>
            </div>
            <Input
              label="Pekerjaan"
              value={occupation}
              onChange={(e) => setOccupation(e.target.value)}
              placeholder="Contoh: Wiraswasta"
              required
            />
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Pendidikan Terakhir
              </label>
              <select
                value={education}
                onChange={(e) => setEducation(e.target.value)}
                required
                className={selectCls}
              >
                <option value="" disabled>
                  Pilih…
                </option>
                {['SD', 'SMP', 'SMA/SMK', 'D1/D2/D3', 'D4/S1', 'S2', 'S3', 'Lainnya'].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">Agama</label>
              <select
                value={religion}
                onChange={(e) => setReligion(e.target.value)}
                required
                className={selectCls}
              >
                <option value="" disabled>
                  Pilih…
                </option>
                {['Islam', 'Kristen', 'Katolik', 'Hindu', 'Buddha', 'Konghucu', 'Lainnya'].map(
                  (v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ),
                )}
              </select>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="mb-2 text-sm font-semibold text-gray-700">Alamat sesuai KTP</p>
            <WilayahPicker value={wilayah} onChange={setWilayah} required />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Alamat Lengkap</label>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
              rows={2}
              placeholder="Jalan, RT/RW, kelurahan…"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
          </div>

          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              id="terms"
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
              className="mt-1 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              required
            />
            <label htmlFor="terms" className="text-sm text-gray-600">
              Saya menyetujui syarat dan ketentuan layanan
            </label>
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => {
                setStep('account');
                setError('');
              }}
            >
              Kembali
            </Button>
            <Button type="submit" isLoading={isLoading} className="flex-1">
              Daftar
            </Button>
          </div>
        </form>
      </div>
    );
  }

  // ── Langkah 1: Akun ─────────────────────────────────────────────────────────
  return (
    <div>
      <Header title="Buat Akun" subtitle="Langkah 1 dari 2 — buat akun Anda." />
      <ErrorBox />
      <form onSubmit={goToProfile} className="space-y-4">
        <Input
          label="Nama Lengkap"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Masukkan nama lengkap"
          required
        />
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
          label="Nomor Telepon"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="08xxxxxxxxxx"
          required
        />
        <Input
          label="Password"
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
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
              className="-m-2 p-2 text-gray-500 transition-colors hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
        />
        <Input
          label="Konfirmasi Password"
          type={showPassword ? 'text' : 'password'}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Ulangi password"
          required
          minLength={8}
          autoComplete="new-password"
          error={
            confirmPassword.length > 0 && confirmPassword !== password
              ? 'Password tidak sama'
              : undefined
          }
        />
        <Button type="submit" className="w-full">
          Lanjut
        </Button>
      </form>

      {/* Daftar dengan Google — hanya tampil bila VITE_GOOGLE_CLIENT_ID diset */}
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

      <p className="mt-6 text-center text-sm text-gray-600">
        Sudah punya akun?{' '}
        <Link to="/login" className="font-medium text-primary-600 hover:text-primary-500">
          Masuk
        </Link>
      </p>
    </div>
  );
}
