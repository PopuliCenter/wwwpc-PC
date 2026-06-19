import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { format } from 'date-fns';
import { api } from '@/services/api';
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
      // Responden hanya boleh ubah NAMA; HP/email dikunci (butuh verifikasi).
      const body =
        profile?.role === 'respondent' ? { fullName } : { fullName, phone, email };
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

  if (loading) {
    return <div className="p-6 text-center text-gray-500">Memuat profil...</div>;
  }

  const inputClass =
    'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:bg-gray-50 disabled:text-gray-500';
  const labelClass = 'mb-1 block text-xs font-medium text-gray-600';

  const isRespondent = profile?.role === 'respondent';
  const demo = profile?.demographics ?? null;

  // Baris read-only untuk data demografi (pembobot) — tak bisa diubah responden.
  const ReadonlyField = ({ label, value }: { label: string; value: string }) => (
    <div>
      <span className={labelClass}>{label}</span>
      <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">{value || '-'}</p>
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Profil Saya</h1>
        <p className="mt-1 text-sm text-gray-500">
          Kelola data diri dan password akun Anda
          {profile ? ` — ${roleLabels[profile.role]}` : ''}.
        </p>
      </div>

      {/* Data diri */}
      <form onSubmit={handleSaveProfile} className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Data Diri</h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="fullName" className={labelClass}>Nama Lengkap</label>
            <input id="fullName" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} required />
          </div>
          <div>
            <label htmlFor="phone" className={labelClass}>Nomor Telepon</label>
            <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} required disabled={isRespondent} />
          </div>
          <div>
            <label htmlFor="email" className={labelClass}>Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} required disabled={isRespondent} />
          </div>
          {isRespondent && (
            <p className="text-xs text-gray-400">
              Nomor telepon & email terkait pengiriman reward dan login, jadi
              perubahannya butuh verifikasi — hubungi admin untuk koreksi.
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
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-base font-semibold text-gray-900">Data Demografi (Pembobot)</h2>
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
      <form onSubmit={handleChangePassword} className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Ganti Password</h2>
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
