import { RouterProvider } from 'react-router-dom';
import { useEffect } from 'react';
import { router } from '@/router';
import { useAuthStore } from '@/stores/auth.store';
import { PWAReloadPrompt } from '@/components/common/PWAReloadPrompt';

function App() {
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <>
      <RouterProvider router={router} />
      <PWAReloadPrompt />
    </>
  );
}

export default App;
