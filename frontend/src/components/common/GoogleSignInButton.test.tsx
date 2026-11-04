import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const GSI_SRC = 'https://accounts.google.com/gsi/client';

describe('GoogleSignInButton web', () => {
  const initialize = vi.fn();
  const renderButton = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'id-klien-uji');
    window.localStorage.clear();
    // Skrip sudah ada: loadGsi tidak perlu memuat dari jaringan.
    const script = document.createElement('script');
    script.src = GSI_SRC;
    document.head.appendChild(script);
    (window as unknown as { google: unknown }).google = {
      accounts: { id: { initialize, renderButton } },
    };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    document.head.querySelector(`script[src="${GSI_SRC}"]`)?.remove();
    delete (window as unknown as { google?: unknown }).google;
  });

  it('mengikuti tema dan digambar ulang tanpa initialize ulang', async () => {
    const { GoogleSignInButton } = await import('./GoogleSignInButton');
    const { setThemePreference } = await import('@/utils/theme');
    const onCredential = vi.fn();

    setThemePreference('light');
    render(<GoogleSignInButton onCredential={onCredential} />);
    await vi.waitFor(() => expect(renderButton).toHaveBeenCalled());
    expect(renderButton.mock.lastCall?.[1]).toMatchObject({ theme: 'outline' });

    act(() => setThemePreference('dark'));
    await vi.waitFor(() =>
      expect(renderButton.mock.lastCall?.[1]).toMatchObject({ theme: 'filled_black' }),
    );

    expect(initialize).toHaveBeenCalledTimes(1);
    // Alur login tidak berubah: kredensial tetap diteruskan apa adanya.
    initialize.mock.calls[0][0].callback({ credential: 'token-uji' });
    expect(onCredential).toHaveBeenCalledWith('token-uji');
  });
});
