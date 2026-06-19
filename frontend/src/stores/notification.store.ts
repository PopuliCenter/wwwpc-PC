import { create } from 'zustand';

/**
 * Notifikasi DALAM aplikasi (in-app pop-up). Dipakai untuk:
 *  - push yang tiba saat aplikasi sedang DI DEPAN (foreground), agar tetap
 *    terlihat sebagai pop-up walau OS tidak selalu menampilkan banner;
 *  - pemberitahuan umum aplikasi (mis. "Undangan dikirim", info, error).
 *
 * Berbeda dari notifikasi SISTEM (status bar HP) yang muncul saat aplikasi
 * di belakang/tertutup — itu ditangani OS via push (FCM/APNs).
 */
export interface AppNotice {
  id: string;
  title: string;
  body?: string;
  /** Rute internal yang dibuka saat pop-up diklik (mis. "/surveys/<id>/fill"). */
  link?: string;
  /** Nuansa warna pop-up. */
  tone?: 'info' | 'success' | 'warning' | 'error';
  /** Auto-tutup setelah sekian ms (0 = tidak auto-tutup). Default 6000. */
  durationMs?: number;
}

interface NotificationState {
  notices: AppNotice[];
  /** Tampilkan pop-up baru. Mengembalikan id-nya. */
  push: (notice: Omit<AppNotice, 'id'>) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

let seq = 0;
const nextId = () => `notice-${Date.now()}-${seq++}`;

export const useNotificationStore = create<NotificationState>((set) => ({
  notices: [],
  push: (notice) => {
    const id = nextId();
    set((s) => ({ notices: [{ id, tone: 'info', durationMs: 6000, ...notice }, ...s.notices] }));
    return id;
  },
  dismiss: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
  clear: () => set({ notices: [] }),
}));

/** Helper non-React (dipakai dari service) untuk menampilkan pop-up. */
export function showAppNotice(notice: Omit<AppNotice, 'id'>): string {
  return useNotificationStore.getState().push(notice);
}
