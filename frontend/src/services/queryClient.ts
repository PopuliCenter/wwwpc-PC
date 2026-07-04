import { QueryClient } from '@tanstack/react-query';

/**
 * QueryClient bersama untuk data-fetching berbasis cache (TanStack Query).
 * Menggantikan pola fetch-in-useEffect: dapat pembatalan otomatis saat param
 * berubah/komponen unmount (hilangkan race condition), cache, dedup, & retry.
 *
 * Default konservatif agar perilaku dekat dgn kode lama:
 *  - staleTime 30d: kurangi refetch beruntun tanpa terasa basi
 *  - refetchOnWindowFocus off: hindari refetch tak terduga saat pindah tab
 *  - retry 1: satu percobaan ulang utk kegagalan transien
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
