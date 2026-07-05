import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, BadgeCheck } from 'lucide-react';
import { api } from '@/services/api';
import { Avatar } from '@/components/common/Avatar';
import { useConfirm } from '@/components/common/ConfirmDialog';
import { LoadingState } from '@/components/common/AsyncState';
import { showAppNotice } from '@/stores/notification.store';
import { useAuthStore } from '@/stores/auth.store';
import { getAppVersion, WEB_APP_VERSION } from '@/utils/appVersion';
import { Capacitor } from '@capacitor/core';
import { AvatarPicker } from './profile/AvatarPicker';
import { DataDiriForm } from './profile/DataDiriForm';
import { PasswordForm } from './profile/PasswordForm';
import { SettingsMenu } from './profile/SettingsMenu';
import { PrivacyPolicyView, TermsView } from './profile/LegalPages';
import { ROLE_LABELS, errMessage, type ProfileData } from './profile/types';

export function ProfilePage() {
  const { user, setUser, logout } = useAuthStore();
  const navigate = useNavigate();
  const { confirm, dialog } = useConfirm();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleDeleteAccount = async () => {
    const ok = await confirm({
      title: 'Hapus akun permanen',
      message:
        'Akun Anda beserta SEMUA data (profil, jawaban survei, dan saldo poin) ' +
        'akan dihapus permanen dan tidak bisa dikembalikan. Poin yang belum ' +
        'ditukar akan hangus.\n\nLanjutkan menghapus akun?',
      confirmText: 'Hapus akun saya',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete('/users/me');
      showAppNotice({ title: 'Akun Anda telah dihapus', tone: 'success', durationMs: 5000 });
      logout();
      navigate('/login');
    } catch (e) {
      showAppNotice({
        title: 'Gagal menghapus akun',
        body: errMessage(e),
        tone: 'error',
        durationMs: 7000,
      });
    }
  };

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);

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
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  // Tampilan menu Settings responden: 'menu' (daftar) atau sub-layar.
  const [view, setView] = useState<'menu' | 'edit' | 'security' | 'privacy' | 'terms'>('menu');
  const [appVersion, setAppVersion] = useState(WEB_APP_VERSION);

  useEffect(() => {
    getAppVersion()
      .then(setAppVersion)
      .catch(() => {});
  }, []);

  // Tombol back Android: saat di sub-layar Settings, kembali ke menu (bukan
  // keluar app). Listener hanya aktif selama di sub-layar; di menu dilepas agar
  // perilaku back default (navigasi/keluar) kembali normal.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (!(profile?.role === 'respondent' && view !== 'menu')) return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    void import('@capacitor/app').then(({ App }) => {
      void App.addListener('backButton', () => setView('menu')).then((handle) => {
        if (cancelled) void handle.remove();
        else cleanup = () => void handle.remove();
      });
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [profile?.role, view]);

  const openStoreRating = () => {
    window.open('https://play.google.com/store/apps/details?id=com.populicenter.survei', '_blank');
  };

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
        setUser({
          ...user,
          fullName: updated.fullName,
          email: updated.email,
          phone: updated.phone,
        });
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

  // Buat password untuk akun tanpa password (mis. dibuat via Google) — tanpa pw lama.
  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ ok: false, text: 'Konfirmasi password tidak sama.' });
      return;
    }
    setSavingPassword(true);
    try {
      await api.patch('/auth/profile/set-password', { newPassword });
      setNewPassword('');
      setConfirmPassword('');
      setProfile((p) => (p ? { ...p, passwordSet: true } : p));
      setPasswordMsg({
        ok: true,
        text: 'Password berhasil dibuat. Kini Anda bisa login dengan email & password.',
      });
    } catch (e) {
      setPasswordMsg({ ok: false, text: errMessage(e) });
    } finally {
      setSavingPassword(false);
    }
  };

  // Upload foto avatar sendiri → MinIO (lewat POST /avatar multipart).
  const handleUploadAvatar = async (file: File) => {
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
    return <LoadingState text="Memuat profil..." />;
  }

  const isRespondent = profile?.role === 'respondent';
  // HP responden: bisa diisi saat masih kosong (akun Google), terkunci setelah terisi.
  const phoneLocked = isRespondent && !!profile?.phone;
  const phoneNeeded = isRespondent && !profile?.phone;
  const demo = profile?.demographics ?? null;

  // Untuk responden, halaman jadi menu Settings dengan sub-layar; admin tetap
  // satu halaman penuh seperti sebelumnya.
  const isMenu = isRespondent && view === 'menu';
  const showHeader = !isRespondent || view === 'menu' || view === 'edit';
  const showDataDiri = !isRespondent || view === 'edit';
  const showPassword = !isRespondent || view === 'security';
  const hasPassword = profile?.passwordSet !== false;

  // Kelengkapan profil (X/3): data diri, email terverifikasi, foto.
  const completeChecks = [
    { label: 'Data diri (nama & telepon)', done: Boolean(profile?.fullName && profile?.phone) },
    { label: 'Email terverifikasi', done: Boolean(profile?.emailVerified) },
    { label: 'Foto profil', done: Boolean(profile?.avatarUrl) },
  ];
  const completeCount = completeChecks.filter((c) => c.done).length;

  const backBarTitle =
    view === 'edit'
      ? 'Ubah Data Diri'
      : view === 'security'
        ? 'Keamanan Akun'
        : view === 'privacy'
          ? 'Kebijakan Privasi'
          : 'Syarat & Ketentuan';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {isRespondent && view !== 'menu' && (
        <button
          type="button"
          onClick={() => setView('menu')}
          className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          ← {backBarTitle}
        </button>
      )}

      {showHeader && (
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
                {profile ? ROLE_LABELS[profile.role] : ''}
              </span>
              {profile?.emailVerified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  <BadgeCheck className="h-3 w-3" /> Email terverifikasi
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {isMenu && (
        <SettingsMenu
          completeCount={completeCount}
          completeChecks={completeChecks}
          appVersion={appVersion}
          onNavigate={navigate}
          onEditData={() => setView('edit')}
          onSecurity={() => setView('security')}
          onPrivacy={() => setView('privacy')}
          onTerms={() => setView('terms')}
          onRating={openStoreRating}
          onLogout={handleLogout}
          onDeleteAccount={handleDeleteAccount}
        />
      )}

      {avatarPickerOpen && (
        <AvatarPicker
          seed={profile?.fullName || profile?.email || 'populi'}
          currentAvatarUrl={profile?.avatarUrl}
          saving={avatarSaving}
          onClose={() => setAvatarPickerOpen(false)}
          onApplyAvatar={applyAvatar}
          onUploadFile={handleUploadAvatar}
        />
      )}

      {showDataDiri && (
        <DataDiriForm
          fullName={fullName}
          onFullNameChange={setFullName}
          phone={phone}
          onPhoneChange={setPhone}
          email={email}
          onEmailChange={setEmail}
          isRespondent={isRespondent}
          phoneLocked={phoneLocked}
          phoneNeeded={phoneNeeded}
          demographics={demo}
          saving={savingProfile}
          message={profileMsg}
          onSubmit={handleSaveProfile}
        />
      )}

      {showPassword && (
        <PasswordForm
          hasPassword={hasPassword}
          currentPassword={currentPassword}
          onCurrentPasswordChange={setCurrentPassword}
          showCurrentPw={showCurrentPw}
          onToggleCurrentPw={() => setShowCurrentPw((v) => !v)}
          newPassword={newPassword}
          onNewPasswordChange={setNewPassword}
          showNewPw={showNewPw}
          onToggleNewPw={() => setShowNewPw((v) => !v)}
          confirmPassword={confirmPassword}
          onConfirmPasswordChange={setConfirmPassword}
          showConfirmPw={showConfirmPw}
          onToggleConfirmPw={() => setShowConfirmPw((v) => !v)}
          saving={savingPassword}
          message={passwordMsg}
          onSubmit={hasPassword ? handleChangePassword : handleSetPassword}
        />
      )}

      {isRespondent && view === 'privacy' && <PrivacyPolicyView />}
      {isRespondent && view === 'terms' && <TermsView />}

      {dialog}
    </div>
  );
}
