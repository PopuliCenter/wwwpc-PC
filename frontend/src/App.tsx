import { RouterProvider } from 'react-router-dom';
import { useEffect } from 'react';
import { router } from '@/router';
import { useAuthStore } from '@/stores/auth.store';
import { PWAReloadPrompt } from '@/components/common/PWAReloadPrompt';
import { EmbedHeightReporter } from '@/components/common/EmbedHeightReporter';

function App() {
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <>
      <RouterProvider router={router} />
      <EmbedHeightReporter />
      <PWAReloadPrompt />
    </>
  );
}

export default App;
