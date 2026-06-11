import { useEffect, useState } from 'react';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/auth.store';
import type { UserRole } from '@/types';

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
}

const roleLabels: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  analyst: 'Analis',
  viewer: 'Viewer',
  respondent: 'Responden',
};

function errMessage(e: unknown): string {
  const m = (e as { message?: unknown })?.message;
  if (Array.isArray(m)) return m.join(', ');
  if (typeof m === 'string') return m;
  return 'Terjadi kesalahan. Coba lagi.';
}

export function ProfilePage() {
  const { user, setUser } = useAuthStore();

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
      const updated = await api.patch<ProfileData>('/auth/profile', {
        fullName,
        phone,
        email,
      });
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
    'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20';
  const labelClass = 'mb-1 block text-xs font-medium text-gray-600';

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
            <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} required />
          </div>
          <div>
            <label htmlFor="email" className={labelClass}>Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} required />
          </div>
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
    </div>
  );
}
