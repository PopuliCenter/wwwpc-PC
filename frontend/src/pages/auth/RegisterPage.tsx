import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { WilayahPicker } from '@/components/common/WilayahPicker';
import { GoogleSignInButton } from '@/components/common/GoogleSignInButton';
import { fieldCls, textareaCls } from '@/components/common/fieldStyles';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/services/api';
import { OCCUPATIONS, OCCUPATION_OTHER } from '@/constants/occupations';
import type { UserRole, LoginResponse } from '@/types';
import {
  AuthError,
  AuthHeader,
  OrDivider,
  PasswordToggle,
  authLinkCls,
  otpInputCls,
} from './AuthShared';

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

const labelCls = 'mb-1.5 block text-sm font-medium text-gray-700';

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
  // Pekerjaan: pilihan dropdown + isian bebas saat "Lainnya".
  const [occupationSelect, setOccupationSelect] = useState('');
  const [occupationOther, setOccupationOther] = useState('');
  const occupation =
    occupationSelect === OCCUPATION_OTHER ? occupationOther.trim() : occupationSelect;
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

  // Pindahkan fokus ke input OTP saat masuk langkah verifikasi (agar responden
  // langsung bisa mengetik, tak perlu mencari field).
  useEffect(() => {
    if (step === 'otp') {
      setTimeout(() => document.getElementById('otp-register')?.focus(), 50);
    }
  }, [step]);

  const goToProfile = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Konfirmasi kata sandi tidak sama.');
      return;
    }
    // Cek dini email & telepon agar user tak mengisi seluruh langkah 2 hanya
    // untuk ditolak di akhir. Bila cek gagal (jaringan/endpoint), tetap lanjut —
    // register final tetap memvalidasi secara otoritatif.
    setIsLoading(true);
    try {
      const res = await api.post<{ emailTaken: boolean; phoneTaken: boolean }>(
        '/registration/check-availability',
        { email, phone },
      );
      if (res.emailTaken) {
        setError('Email sudah terdaftar. Silakan masuk, atau gunakan email lain.');
        return;
      }
      if (res.phoneTaken) {
        setError('Nomor telepon sudah terdaftar. Silakan masuk, atau gunakan nomor lain.');
        return;
      }
    } catch {
      /* endpoint hiccup → biarkan lanjut; validasi final tetap menegakkan */
    } finally {
      setIsLoading(false);
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

  // ── Langkah 3: OTP ──────────────────────────────────────────────────────────
  if (step === 'otp') {
    return (
      <div>
        <AuthHeader
          title="Verifikasi email"
          subtitle="Langkah 3 dari 3. Masukkan 6 digit kode yang dikirim ke email Anda."
        />
        {otpInfo && (
          <p className="mb-4 text-sm text-gray-600" role="status">
            {otpInfo}
          </p>
        )}
        <AuthError message={error} />
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <div>
            <label htmlFor="otp-register" className={labelCls}>
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
              className={otpInputCls}
              required
            />
          </div>
          <Button
            type="submit"
            size="lg"
            isLoading={isLoading}
            className="w-full"
            disabled={otp.length !== 6}
          >
            Verifikasi
          </Button>
        </form>
        {/* Margin negatif meratakan teks tombol ghost dengan tepi form.
            Hitung mundur perlu terbaca saat tombol nonaktif, jadi opasitas 50% bawaan
            Button dilepas dan warnanya dibuat lebih redup (gray-500, 6,42:1 di putih). */}
        <div className="mt-4 flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-3 tabular-nums disabled:opacity-100! disabled:text-gray-500"
            onClick={handleResendOtp}
            disabled={resendCooldown > 0 || resending}
          >
            {resending
              ? 'Mengirim…'
              : resendCooldown > 0
                ? `Kirim ulang dalam ${resendCooldown}s`
                : 'Kirim ulang kode'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-mr-3"
            onClick={() => {
              setStep('profile');
              setOtp('');
              setError('');
            }}
          >
            Kembali
          </Button>
        </div>
      </div>
    );
  }

  // ── Langkah 2: Data Diri ────────────────────────────────────────────────────
  if (step === 'profile') {
    return (
      <div>
        <AuthHeader title="Data diri" subtitle="Langkah 2 dari 3. Lengkapi data diri Anda." />
        <AuthError message={error} />
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Input
                label="Tanggal lahir"
                type="date"
                max={TODAY_ISO}
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                required
              />
              {ageFromDob(dateOfBirth) !== null && (
                <p className="mt-1 text-xs text-gray-600">Usia: {ageFromDob(dateOfBirth)} tahun</p>
              )}
            </div>
            <div>
              <label htmlFor="jenis-kelamin" className={labelCls}>
                Jenis kelamin
              </label>
              <select
                id="jenis-kelamin"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                required
                className={fieldCls}
              >
                <option value="" disabled>
                  Pilih…
                </option>
                <option value="male">Laki-laki</option>
                <option value="female">Perempuan</option>
              </select>
            </div>
            <div>
              <label htmlFor="pekerjaan" className={labelCls}>
                Pekerjaan
              </label>
              <select
                id="pekerjaan"
                value={occupationSelect}
                onChange={(e) => setOccupationSelect(e.target.value)}
                required
                className={fieldCls}
              >
                <option value="" disabled>
                  Pilih…
                </option>
                {OCCUPATIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
                <option value={OCCUPATION_OTHER}>Lainnya…</option>
              </select>
              {occupationSelect === OCCUPATION_OTHER && (
                <div className="mt-2">
                  <Input
                    aria-label="Pekerjaan lainnya"
                    value={occupationOther}
                    onChange={(e) => setOccupationOther(e.target.value)}
                    placeholder="Tulis pekerjaan Anda"
                    maxLength={100}
                    required
                  />
                </div>
              )}
            </div>
            <div>
              <label htmlFor="pendidikan-terakhir" className={labelCls}>
                Pendidikan terakhir
              </label>
              <select
                id="pendidikan-terakhir"
                value={education}
                onChange={(e) => setEducation(e.target.value)}
                required
                className={fieldCls}
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
              <label htmlFor="agama" className={labelCls}>
                Agama
              </label>
              <select
                id="agama"
                value={religion}
                onChange={(e) => setReligion(e.target.value)}
                required
                className={fieldCls}
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

          <div className="border-t border-gray-200 pt-4">
            <p className="mb-2 text-sm font-semibold text-gray-900">Alamat sesuai KTP</p>
            <WilayahPicker value={wilayah} onChange={setWilayah} required />
          </div>

          <div>
            <label htmlFor="alamat-lengkap" className={labelCls}>
              Alamat lengkap
            </label>
            <textarea
              id="alamat-lengkap"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
              rows={2}
              placeholder="Jalan, RT/RW, kelurahan…"
              className={textareaCls}
            />
          </div>

          {/* Seluruh baris menjadi area ketuk, jadi targetnya tidak sekecil kotak centang. */}
          <label
            htmlFor="terms"
            className="flex min-h-11 items-start gap-3 py-1 text-sm text-gray-700"
          >
            <input
              type="checkbox"
              id="terms"
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
              className="h-5 w-5 shrink-0 accent-primary-600"
              required
            />
            <span>Saya menyetujui syarat dan ketentuan layanan</span>
          </label>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="flex-1"
              onClick={() => {
                setStep('account');
                setError('');
              }}
            >
              Kembali
            </Button>
            <Button type="submit" size="lg" isLoading={isLoading} className="flex-1">
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
      <AuthHeader title="Daftar" subtitle="Langkah 1 dari 3. Buat akun Anda." />
      <AuthError message={error} />
      <form onSubmit={goToProfile} className="space-y-4">
        <Input
          label="Nama lengkap"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Masukkan nama lengkap"
          required
        />
        <Input
          label="Email"
          type="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nama@email.com"
          required
          autoComplete="email"
        />
        <Input
          label="Nomor telepon"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="08xxxxxxxxxx"
          required
        />
        <Input
          label="Kata sandi"
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
          label="Konfirmasi kata sandi"
          type={showPassword ? 'text' : 'password'}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Ulangi kata sandi"
          required
          minLength={8}
          autoComplete="new-password"
          error={
            confirmPassword.length > 0 && confirmPassword !== password
              ? 'Kata sandi tidak sama'
              : undefined
          }
        />
        <Button type="submit" size="lg" className="w-full" isLoading={isLoading}>
          Lanjut
        </Button>
      </form>

      {/* Daftar dengan Google — hanya tampil bila VITE_GOOGLE_CLIENT_ID diset */}
      {import.meta.env.VITE_GOOGLE_CLIENT_ID && (
        <>
          <OrDivider />
          <GoogleSignInButton onCredential={handleGoogleCredential} label="Daftar dengan Google" />
        </>
      )}

      <p className="mt-6 text-sm text-gray-600">
        Sudah punya akun?{' '}
        <Link to="/login" className={authLinkCls}>
          Masuk
        </Link>
      </p>
    </div>
  );
}
