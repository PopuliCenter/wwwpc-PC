import { RouterProvider } from 'react-router-dom';
import { useEffect } from 'react';
import { router } from '@/router';
import { useAuthStore } from '@/stores/auth.store';
import { PWAReloadPrompt } from '@/components/common/PWAReloadPrompt';
import { EmbedHeightReporter } from '@/components/common/EmbedHeightReporter';
import { NotificationHost } from '@/components/common/NotificationHost';
import { initNativeNotifications } from '@/services/notifications';

function App() {
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    initialize();
    // Daftar push notifikasi saat berjalan di Capacitor (no-op di web).
    void initNativeNotifications();
  }, [initialize]);

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
