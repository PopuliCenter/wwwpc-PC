import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { useAuthStore } from '@/stores/auth.store';
import { useGeolocation } from '@/hooks/useGeolocation';
import { api } from '@/services/api';
import type { LoginResponse } from '@/types';

type Step = 'basic' | 'otp' | 'profile';

export function RegisterPage() {
  const [step, setStep] = useState<Step>('basic');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const { location, isLoading: geoLoading, requestLocation } = useGeolocation();

  // Step 1: Basic data
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);

  // Step 2: OTP
  const [otp, setOtp] = useState('');

  // Step 3: Profile
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [occupation, setOccupation] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');

  // Auto-fill city/province from geolocation
  const handleRequestLocation = () => {
    requestLocation();
  };

  // Update city/province when geolocation result arrives
  if (location && !city && !province) {
    if (location.city) setCity(location.city);
    if (location.province) setProvince(location.province);
  }

  const handleBasicSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await api.post('/registration/register', { fullName, email, phone, password, termsAccepted: acceptTerms });
      setStep('otp');
    } catch (err: unknown) {
      const apiError = err as { message?: string };
      setError(apiError.message || 'Registrasi gagal. Silakan coba lagi.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await api.post('/registration/verify-otp', { email, code: otp });
      setStep('profile');
      // Request geolocation when moving to profile step
      requestLocation();
    } catch (err: unknown) {
      const apiError = err as { message?: string };
      setError(apiError.message || 'Kode OTP tidak valid.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleProfileSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await api.post<LoginResponse>('/registration/complete-profile', {
        email,
        age: age ? parseInt(age, 10) : undefined,
        gender: gender || undefined,
        occupation: occupation || undefined,
        city: city || undefined,
        province: province || undefined,
        latitude: location?.latitude,
        longitude: location?.longitude,
      });
      login(response.user, response.accessToken, response.refreshToken);
      navigate('/surveys');
    } catch (err: unknown) {
      const apiError = err as { message?: string };
      setError(apiError.message || 'Gagal menyimpan profil.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col items-center mb-4">
        <img src="/logo-populi-center.png" alt="Populi Center" className="h-14 w-auto mb-2" />
        <h2 className="text-xl font-semibold text-gray-900">Survei Online</h2>
        <p className="text-sm text-gray-500 mt-1">Buat Akun Baru</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {(['basic', 'otp', 'profile'] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step === s
                  ? 'bg-primary-600 text-white'
                  : i < ['basic', 'otp', 'profile'].indexOf(step)
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 text-gray-600'
              }`}
            >
              {i + 1}
            </div>
            {i < 2 && <div className="w-8 h-0.5 bg-gray-200" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-200" role="alert">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Step 1: Basic Info */}
      {step === 'basic' && (
        <form onSubmit={handleBasicSubmit} className="space-y-4">
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
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimal 8 karakter"
            required
            minLength={8}
            autoComplete="new-password"
          />
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
            Lanjutkan
          </Button>
        </form>
      )}

      {/* Step 2: OTP Verification */}
      {step === 'otp' && (
        <form onSubmit={handleOtpSubmit} className="space-y-4">
          <p className="text-sm text-gray-600 mb-4">
            Kode verifikasi telah dikirim ke <strong>{email}</strong>
          </p>
          <Input
            label="Kode OTP"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder="Masukkan 6 digit kode"
            required
            maxLength={6}
            pattern="[0-9]{6}"
          />
          <Button type="submit" isLoading={isLoading} className="w-full">
            Verifikasi
          </Button>
        </form>
      )}

      {/* Step 3: Profile Completion */}
      {step === 'profile' && (
        <form onSubmit={handleProfileSubmit} className="space-y-4">
          <p className="text-sm text-gray-600 mb-4">Lengkapi profil Anda (opsional)</p>
          <Input
            label="Usia"
            type="number"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            placeholder="Contoh: 25"
            min={13}
            max={120}
          />
          <div className="space-y-1">
            <label htmlFor="gender" className="block text-sm font-medium text-gray-700">
              Jenis Kelamin
            </label>
            <select
              id="gender"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            >
              <option value="">Pilih jenis kelamin</option>
              <option value="male">Laki-laki</option>
              <option value="female">Perempuan</option>
              <option value="other">Lainnya</option>
            </select>
          </div>
          <Input
            label="Pekerjaan"
            value={occupation}
            onChange={(e) => setOccupation(e.target.value)}
            placeholder="Contoh: Mahasiswa"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Kota"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Kota"
            />
            <Input
              label="Provinsi"
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              placeholder="Provinsi"
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={handleRequestLocation}
            isLoading={geoLoading}
            className="w-full"
          >
            📍 Deteksi Lokasi Otomatis
          </Button>
          <Button type="submit" isLoading={isLoading} className="w-full">
            Selesai
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-gray-600">
        Sudah punya akun?{' '}
        <Link to="/login" className="text-primary-600 hover:text-primary-500 font-medium">
          Masuk
        </Link>
      </p>
    </div>
  );
}
