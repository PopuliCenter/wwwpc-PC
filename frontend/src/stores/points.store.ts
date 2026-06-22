import { create } from 'zustand';
import { api } from '@/services/api';

/**
 * Saldo poin bersama agar header (RespondentLayout) dan halaman Reward selalu
 * sinkron. Sebelumnya header mengambil saldo sekali saja sehingga tidak ikut
 * berubah saat poin bertambah (selesai survei) atau berkurang (penukaran).
 */
interface PointsState {
  available: number | null;
  setAvailable: (n: number | null) => void;
  refresh: () => Promise<void>;
}

export const usePointsStore = create<PointsState>((set) => ({
  available: null,
  setAvailable: (n) => set({ available: n }),
  refresh: async () => {
    try {
      const b = await api.get<{ available: number }>('/rewards/balance');
      set({ available: b?.available ?? 0 });
    } catch {
      /* gagal ambil → pertahankan nilai lama, jangan ganggu UI */
    }
  },
}));
