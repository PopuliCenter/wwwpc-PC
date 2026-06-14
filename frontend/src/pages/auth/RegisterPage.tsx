import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/services/api';
import type { UserRole } from '@/types';

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

export function RegisterPage() {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  // Data diri responden
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [occupation, setOccupation] = useState('');
  const [education, setEducation] = useState('');
  const [religion, setReligion] = useState('');
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Langkah verifikasi OTP
  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [otp, setOtp] = useState('');
  const [otpInfo, setOtpInfo] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Konfirmasi password tidak sama.');
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
        age: Number(age),
        gender,
        occupation,
        education,
        religion,
        province,
        city,
        address,
      });
      // Akun dibuat (PENDING). Lanjut ke verifikasi OTP yang dikirim ke email.
      setOtpInfo(`Kode OTP telah dikirim ke ${email}.`);
      setStep('otp');
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
    setError('');
    setOtpInfo('');
    try {
      await api.post('/registration/resend-otp', { email });
      setOtpInfo(`Kode OTP baru telah dikirim ke ${email}.`);
    } catch (err: unknown) {
      const apiError = err as { message?: string };
      setError(apiError.message || 'Gagal mengirim ulang OTP.');
    }
  };

  if (step === 'otp') {
    return (
      <div>
        <div className="mb-6 flex flex-col items-center">
          <img src="/logo-populi-center.png" alt="Populi Center" className="mb-2 h-14 w-14 object-contain" />
          <h2 className="text-xl font-semibold text-gray-900">Verifikasi Email</h2>
          <p className="mt-1 text-center text-sm text-gray-500">
            Masukkan 6 digit kode yang dikirim ke email Anda.
          </p>
        </div>

        {otpInfo && (
          <div className="mb-4 rounded-md border border-primary-200 bg-primary-50 p-3 text-sm text-primary-700">
            {otpInfo}
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3" role="alert">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <input
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="______"
            className="w-full rounded-md border border-gray-300 px-3 py-3 text-center text-2xl font-semibold tracking-[0.5em] focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            required
          />
          <Button type="submit" isLoading={isLoading} className="w-full" disabled={otp.length !== 6}>
            Verifikasi
          </Button>
        </form>

        <div className="mt-4 flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={handleResendOtp}
            className="font-medium text-primary-600 hover:text-primary-500"
          >
            Kirim ulang kode
          </button>
          <button
            type="button"
            onClick={() => {
              setStep('form');
              setOtp('');
              setError('');
            }}
            className="text-gray-500 hover:text-gray-700"
          >
            Ubah data
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col items-center">
        <img src="/logo-populi-center.png" alt="Populi Center" className="mb-2 h-14 w-14 object-contain" />
        <h2 className="text-xl font-semibold text-gray-900">Buat Akun</h2>
        <p className="mt-1 text-sm text-gray-500">Daftar untuk mulai mengisi survei.</p>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3" role="alert">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
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
        {/* ── Data Diri (responden) ───────────────────────────────────── */}
        <div className="border-t border-gray-100 pt-4">
          <p className="mb-3 text-sm font-semibold text-gray-700">Data Diri</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Umur"
              type="number"
              min={13}
              max={120}
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="Contoh: 28"
              required
            />
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Jenis Kelamin</label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              >
                <option value="" disabled>Pilih…</option>
                <option value="male">Laki-laki</option>
                <option value="female">Perempuan</option>
                <option value="other">Lainnya</option>
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
              <label className="mb-1 block text-sm font-medium text-gray-700">Pendidikan Terakhir</label>
              <select
                value={education}
                onChange={(e) => setEducation(e.target.value)}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              >
                <option value="" disabled>Pilih…</option>
                {['SD', 'SMP', 'SMA/SMK', 'D1/D2/D3', 'D4/S1', 'S2', 'S3', 'Lainnya'].map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Agama</label>
              <select
                value={religion}
                onChange={(e) => setReligion(e.target.value)}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              >
                <option value="" disabled>Pilih…</option>
                {['Islam', 'Kristen', 'Katolik', 'Hindu', 'Buddha', 'Konghucu', 'Lainnya'].map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
            <Input
              label="Provinsi"
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              placeholder="Contoh: Jawa Barat"
              required
            />
            <Input
              label="Kota/Kabupaten"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Contoh: Bandung"
              required
            />
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">Alamat Lengkap</label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
                rows={2}
                placeholder="Jalan, RT/RW, kelurahan, kecamatan…"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
            </div>
          </div>
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
        <Button type="submit" isLoading={isLoading} className="w-full">
          Daftar
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-600">
        Sudah punya akun?{' '}
        <Link to="/login" className="font-medium text-primary-600 hover:text-primary-500">
          Masuk
        </Link>
      </p>
    </div>
  );
}
