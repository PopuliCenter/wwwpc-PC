import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import { RespondentsPage } from './RespondentsPage';
import { useAuthStore } from '@/stores/auth.store';
import { useNotificationStore } from '@/stores/notification.store';
import type { User } from '@/types';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
}));
vi.mock('@/services/api', () => ({ api: mocks }));

const RESPONDENT = {
  id: '11111111-1111-4111-8111-111111111111',
  fullName: 'Siti Aminah',
  email: 'siti@contoh.id',
  phone: '0812',
  age: 30,
  gender: 'female',
  occupation: null,
  education: null,
  religion: null,
  province: null,
  city: null,
  district: null,
  address: null,
  registeredAt: '2026-11-01T00:00:00.000Z',
};

function setRole(role: User['role']) {
  useAuthStore.setState({ user: { id: 'admin-1', role } as User, isAuthenticated: true });
}

async function openRowMenu() {
  render(<RespondentsPage />);
  // Halaman memuat dua kali (saat mount + debounce pencarian 400 ms). Lewati debounce
  // di dalam act agar baris tidak ter-unmount oleh skeleton saat menu terbuka.
  await act(() => new Promise((r) => setTimeout(r, 450)));
  expect(mocks.get).toHaveBeenCalledTimes(2);
  fireEvent.click(await screen.findByRole('button', { name: `Aksi untuk ${RESPONDENT.fullName}` }));
}

function lastNotice() {
  return useNotificationStore.getState().notices[0];
}

describe('RespondentsPage — kirim notifikasi uji', () => {
  beforeEach(() => {
    mocks.get.mockResolvedValue([RESPONDENT]);
    useNotificationStore.getState().clear();
    setRole('admin');
  });
  afterEach(() => {
    // Lepas halaman dulu: mengubah store saat masih terpasang memicu update di luar act.
    cleanup();
    vi.clearAllMocks();
    useAuthStore.setState({ user: null, isAuthenticated: false });
  });

  it('memanggil POST /notifications/test-push dan melaporkan jumlah perangkat', async () => {
    mocks.post.mockResolvedValue({ pushEnabled: true, devices: 2, pushed: 2 });
    await openRowMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Kirim notifikasi uji' }));

    await waitFor(() => expect(lastNotice()?.title).toBe('Terkirim ke 2 perangkat.'));
    expect(lastNotice()?.tone).toBe('success');
    expect(mocks.post).toHaveBeenCalledWith('/notifications/test-push', {
      userId: RESPONDENT.id,
    });
  });

  it.each([
    [{ pushEnabled: false, devices: 0, pushed: 0 }, 'Push belum aktif di server.'],
    [
      { pushEnabled: true, devices: 0, pushed: 0 },
      'Siti Aminah belum punya perangkat terdaftar. Minta ia membuka aplikasi Android dan mengizinkan notifikasi.',
    ],
    [
      { pushEnabled: true, devices: 3, pushed: 0 },
      'Tidak ada yang diterima FCM untuk 3 perangkat. Token mungkin kedaluwarsa atau layanan push bermasalah; cek log server.',
    ],
  ])('hasil %o → peringatan awam', async (res, message) => {
    mocks.post.mockResolvedValue(res);
    await openRowMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Kirim notifikasi uji' }));

    await waitFor(() => expect(lastNotice()?.title).toBe(message));
    expect(lastNotice()?.tone).toBe('warning');
  });

  it('galat jaringan tampil sebagai error', async () => {
    mocks.post.mockRejectedValue(new TypeError('Failed to fetch'));
    await openRowMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Kirim notifikasi uji' }));

    await waitFor(() => expect(lastNotice()?.tone).toBe('error'));
    expect(lastNotice()?.title).toBe('Gagal mengirim notifikasi uji');
    expect(lastNotice()?.body).toBe('Failed to fetch');
  });

  it('aksi dinonaktifkan selama memanggil', async () => {
    let resolve: (v: unknown) => void = () => {};
    mocks.post.mockReturnValue(new Promise((r) => (resolve = r)));
    await openRowMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Kirim notifikasi uji' }));

    // Buka lagi menunya saat permintaan masih berjalan.
    fireEvent.click(screen.getByRole('button', { name: `Aksi untuk ${RESPONDENT.fullName}` }));
    const busy = screen.getByRole('menuitem', { name: 'Mengirim notifikasi uji…' });
    expect(busy).toBeDisabled();
    fireEvent.click(busy);
    expect(mocks.post).toHaveBeenCalledTimes(1);

    resolve({ pushEnabled: true, devices: 1, pushed: 1 });
    await waitFor(() => expect(lastNotice()?.title).toBe('Terkirim ke 1 perangkat.'));
  });

  it('tidak tampil untuk peran yang tidak boleh mengirim pengumuman', async () => {
    setRole('analyst');
    await openRowMenu();
    expect(screen.queryByRole('menuitem', { name: 'Kirim notifikasi uji' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Hapus' })).toBeInTheDocument();
  });
});
