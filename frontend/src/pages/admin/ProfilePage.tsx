import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, User, Lock, BadgeCheck, BarChart3, Camera, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { api } from '@/services/api';
import { Avatar } from '@/components/common/Avatar';
import { useAuthStore } from '@/stores/auth.store';
import type { UserRole } from '@/types';

interface Demographics {
  dateOfBirth: string | null;
  age: number | null;
  gender: string | null;
  education: string | null;
  occupation: string | null;
  religion: string | null;
  province: string | null;
  city: string | null;
  district: string | null;
}

interface ProfileData {
  id: string;
  email: string;
  phone: string;
  fullName: string;
  avatarUrl: string | null;
  role: UserRole;
  status: string;
  emailVerified: boolean;
  profileCompleted: boolean;
  createdAt: string;
  demographics?: Demographics | null;
}

const GENDER_LABELS: Record<string, string> = {
  male: 'Laki-laki',
  female: 'Perempuan',
  other: 'Lainnya',
};

function fmtDate(value: string | null): string {
  if (!value) return '-';
  try {
    return format(new Date(value), 'dd MMM yyyy');
  } catch {
    return value;
  }
}

const roleLabels: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  analyst: 'Analis',
  viewer: 'Viewer',
  respondent: 'Responden',
  surveyor: 'Surveyor (TPD)',
};

function errMessage(e: unknown): string {
  const m = (e as { message?: unknown })?.message;
  if (Array.isArray(m)) return m.join(', ');
  if (typeof m === 'string') return m;
  return 'Terjadi kesalahan. Coba lagi.';
}

export function ProfilePage() {
  const { user, setUser, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form data diri
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Form password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await api.get<ProfileData>('/auth/profile');
        if (!active) return;
        setProfile(data);
        setFullName(data.fullName);
        setPhone(data.phone);
        setEmail(data.email);
      } catch (e) {
        if (active) setProfileMsg({ ok: false, text: errMessage(e) });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      // Responden boleh ubah NAMA; HP boleh DIISI saat masih kosong (akun Google),
      // tapi setelah terisi dikunci (butuh verifikasi). Email tetap dikunci.
      const isResp = profile?.role === 'respondent';
      const body = isResp
        ? profile?.phone
          ? { fullName }
          : { fullName, phone }
        : { fullName, phone, email };
      const updated = await api.patch<ProfileData>('/auth/profile', body);
      setProfile(updated);
      // Sinkronkan ke store agar sidebar/header ikut terbarui
      if (user) {
        setUser({ ...user, fullName: updated.fullName, email: updated.email, phone: updated.phone });
      }
      setProfileMsg({ ok: true, text: 'Data diri berhasil diperbarui.' });
    } catch (e) {
      setProfileMsg({ ok: false, text: errMessage(e) });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ ok: false, text: 'Konfirmasi password tidak sama.' });
      return;
    }
    setSavingPassword(true);
    try {
      await api.patch('/auth/profile/password', { currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMsg({ ok: true, text: 'Password berhasil diganti.' });
    } catch (e) {
      setPasswordMsg({ ok: false, text: errMessage(e) });
    } finally {
      setSavingPassword(false);
    }
  };

  // Upload foto avatar sendiri → MinIO (lewat POST /avatar multipart).
  const handleUploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset agar memilih file sama tetap memicu onChange
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setProfileMsg({ ok: false, text: 'Avatar harus berupa gambar.' });
      return;
    }
    setAvatarSaving(true);
    setProfileMsg(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.upload<{ avatarUrl: string }>('/avatar', fd);
      setProfile((p) => (p ? { ...p, avatarUrl: res.avatarUrl } : p));
      if (user) setUser({ ...user, avatarUrl: res.avatarUrl });
      setAvatarPickerOpen(false);
    } catch (err) {
      setProfileMsg({ ok: false, text: errMessage(err) });
    } finally {
      setAvatarSaving(false);
    }
  };

  // Set / hapus avatar (url null/'' = kembali ke inisial). Sinkron ke store agar
  // header/sidebar ikut berubah.
  const applyAvatar = async (url: string | null) => {
    setAvatarSaving(true);
    setProfileMsg(null);
    try {
      const updated = await api.patch<ProfileData>('/auth/profile', { avatarUrl: url ?? '' });
      setProfile(updated);
      if (user) setUser({ ...user, avatarUrl: updated.avatarUrl });
      setAvatarPickerOpen(false);
    } catch (e) {
      setProfileMsg({ ok: false, text: errMessage(e) });
    } finally {
      setAvatarSaving(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-center text-gray-500">Memuat profil...</div>;
  }

  const inputClass =
    'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:bg-gray-50 disabled:text-gray-500';
  const labelClass = 'mb-1 block text-xs font-medium text-gray-600';

  const isRespondent = profile?.role === 'respondent';
  // HP responden: bisa diisi saat masih kosong (akun Google), terkunci setelah terisi.
  const phoneLocked = isRespondent && !!profile?.phone;
  const phoneNeeded = isRespondent && !profile?.phone;
  const demo = profile?.demographics ?? null;

  // Avatar generated (DiceBear) seed dari nama — tanpa upload file.
  const avatarSeed = encodeURIComponent(profile?.fullName || profile?.email || 'populi');
  const generatedAvatars = ['avataaars', 'bottts', 'fun-emoji', 'thumbs', 'identicon', 'adventurer'].map(
    (style) => `https://api.dicebear.com/9.x/${style}/svg?seed=${avatarSeed}`,
  );

  // Baris read-only untuk data demografi (pembobot) — tak bisa diubah responden.
  const ReadonlyField = ({ label, value }: { label: string; value: string }) => (
    <div>
      <span className={labelClass}>{label}</span>
      <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">{value || '-'}</p>
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="relative shrink-0">
          <Avatar name={profile?.fullName} url={profile?.avatarUrl} size={64} />
          <button
            type="button"
            onClick={() => setAvatarPickerOpen((v) => !v)}
            aria-label="Ubah foto profil"
            className="absolute -bottom-1 -right-1 rounded-full border-2 border-white bg-primary-600 p-1.5 text-white shadow-sm transition-colors hover:bg-primary-700"
          >
            <Camera className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold text-gray-900">
            {profile?.fullName || 'Profil Saya'}
          </h1>
          <p className="truncate text-sm text-gray-500">{profile?.email}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">
              {profile ? roleLabels[profile.role] : ''}
            </span>
            {profile?.emailVerified && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                <BadgeCheck className="h-3 w-3" /> Email terverifikasi
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Pemilih avatar */}
      {avatarPickerOpen && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Pilih Avatar</h2>
            <button
              type="button"
              onClick={() => setAvatarPickerOpen(false)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Tutup
            </button>
          </div>
          <p className="mb-3 text-xs text-gray-500">
            Pilih salah satu avatar, atau hapus untuk memakai inisial nama. Foto akun Google
            terpasang otomatis saat login.
          </p>
          <div className="flex flex-wrap gap-3">
            {generatedAvatars.map((url) => (
              <button
                key={url}
                type="button"
                disabled={avatarSaving}
                onClick={() => applyAvatar(url)}
                className={`rounded-full ring-2 transition disabled:opacity-50 ${
                  profile?.avatarUrl === url ? 'ring-primary-500' : 'ring-transparent hover:ring-gray-200'
                }`}
              >
                <img
                  src={url}
                  alt="Pilihan avatar"
                  width={56}
                  height={56}
                  className="h-14 w-14 rounded-full bg-gray-50"
                />
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleUploadAvatar}
            />
            <button
              type="button"
              disabled={avatarSaving}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              <Camera className="h-3.5 w-3.5" /> Upload foto
            </button>
            <button
              type="button"
              disabled={avatarSaving || !profile?.avatarUrl}
              onClick={() => applyAvatar(null)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> Hapus (pakai inisial)
            </button>
          </div>
          {avatarSaving && <p className="mt-2 text-xs text-gray-400">Menyimpan…</p>}
        </div>
      )}

      {/* Data diri */}
      <form onSubmit={handleSaveProfile} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900">
          <User className="h-4 w-4 text-primary-600" /> Data Diri
        </h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="fullName" className={labelClass}>Nama Lengkap</label>
            <input id="fullName" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} required />
          </div>
          <div>
            <label htmlFor="phone" className={labelClass}>Nomor Telepon</label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
              placeholder={phoneNeeded ? '08xxxxxxxxxx' : undefined}
              required
              disabled={phoneLocked}
            />
            {phoneNeeded && (
              <p className="mt-1 text-xs text-amber-600">
                Wajib diisi untuk bisa mengikuti survei.
              </p>
            )}
          </div>
          <div>
            <label htmlFor="email" className={labelClass}>Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} required disabled={isRespondent} />
          </div>
          {isRespondent && (
            <p className="text-xs text-gray-400">
              {phoneNeeded
                ? 'Email terkait login dikunci. Nomor telepon dipakai untuk pengiriman reward — setelah diisi, perubahannya butuh verifikasi admin.'
                : 'Nomor telepon & email terkait pengiriman reward dan login, jadi perubahannya butuh verifikasi — hubungi admin untuk koreksi.'}
            </p>
          )}
        </div>
        <div className="mt-5 flex items-center gap-3">
          <button type="submit" disabled={savingProfile} className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50">
            {savingProfile ? 'Menyimpan...' : 'Simpan Perubahan'}
          </button>
          {profileMsg && (
            <span className={`text-sm ${profileMsg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{profileMsg.text}</span>
          )}
        </div>
      </form>

      {/* Data demografi (pembobot) — read-only untuk responden */}
      {demo && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-gray-900">
            <BarChart3 className="h-4 w-4 text-primary-600" /> Data Demografi (Pembobot)
          </h2>
          <p className="mb-4 text-xs text-gray-500">
            Data ini dikunci untuk menjaga kualitas analisis dan mencegah penyalahgunaan
            targeting. Untuk koreksi, hubungi admin.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ReadonlyField label="Tanggal Lahir" value={fmtDate(demo.dateOfBirth)} />
            <ReadonlyField label="Usia" value={demo.age != null ? `${demo.age} tahun` : '-'} />
            <ReadonlyField
              label="Jenis Kelamin"
              value={demo.gender ? GENDER_LABELS[demo.gender] ?? demo.gender : '-'}
            />
            <ReadonlyField label="Pendidikan" value={demo.education ?? '-'} />
            <ReadonlyField label="Pekerjaan" value={demo.occupation ?? '-'} />
            <ReadonlyField label="Agama" value={demo.religion ?? '-'} />
            <ReadonlyField label="Provinsi" value={demo.province ?? '-'} />
            <ReadonlyField label="Kabupaten/Kota" value={demo.city ?? '-'} />
            <ReadonlyField label="Kecamatan" value={demo.district ?? '-'} />
          </div>
          <p className="mt-4 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">
            Domisili terkini Anda akan ditanyakan langsung di survei bila diperlukan, sehingga
            wilayah di atas tetap menjadi acuan data registrasi.
          </p>
        </div>
      )}

      {/* Ganti password */}
      <form onSubmit={handleChangePassword} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900">
          <Lock className="h-4 w-4 text-primary-600" /> Ganti Password
        </h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="currentPassword" className={labelClass}>Password Lama</label>
            <input id="currentPassword" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={inputClass} required autoComplete="current-password" />
          </div>
          <div>
            <label htmlFor="newPassword" className={labelClass}>Password Baru</label>
            <input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputClass} required autoComplete="new-password" />
            <p className="mt-1 text-xs text-gray-400">Min. 8 karakter, mengandung huruf besar, huruf kecil, angka, dan simbol.</p>
          </div>
          <div>
            <label htmlFor="confirmPassword" className={labelClass}>Konfirmasi Password Baru</label>
            <input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputClass} required autoComplete="new-password" />
          </div>
        </div>
        <div className="mt-5 flex items-center gap-3">
          <button type="submit" disabled={savingPassword} className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50">
            {savingPassword ? 'Menyimpan...' : 'Ganti Password'}
          </button>
          {passwordMsg && (
            <span className={`text-sm ${passwordMsg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{passwordMsg.text}</span>
          )}
        </div>
      </form>

      {/* Keluar — untuk responden (navigasi tab tak lagi memuat tombol logout) */}
      {profile?.role === 'respondent' && (
        <button
          onClick={handleLogout}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
        >
          <LogOut className="h-4 w-4" /> Keluar
        </button>
      )}
    </div>
  );
}
