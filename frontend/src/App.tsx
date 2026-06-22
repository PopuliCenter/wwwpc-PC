import { RouterProvider } from 'react-router-dom';
import { useEffect } from 'react';
import { router } from '@/router';
import { useAuthStore } from '@/stores/auth.store';
import { PWAReloadPrompt } from '@/components/common/PWAReloadPrompt';
import { EmbedHeightReporter } from '@/components/common/EmbedHeightReporter';
import { NotificationHost } from '@/components/common/NotificationHost';
import { initNativeNotifications, syncDeviceToken } from '@/services/notifications';

function App() {
  const initialize = useAuthStore((state) => state.initialize);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  useEffect(() => {
    initialize();
    // Daftar push notifikasi saat berjalan di Capacitor (no-op di web).
    void initNativeNotifications();
  }, [initialize]);

  // Setelah user login (apa pun jalurnya: email/Google/registrasi), kirim ulang
  // device token agar terkait user ini → push bisa sampai. Token mungkin sudah
  // diterima saat di layar login (POST pertamanya gagal karena belum ada sesi).
  useEffect(() => {
    if (isAuthenticated) void syncDeviceToken();
  }, [isAuthenticated]);

  return (
    <>
      <RouterProvider router={router} />
      <EmbedHeightReporter />
      <PWAReloadPrompt />
      <NotificationHost />
    </>
  );
}

export default App;
