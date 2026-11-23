import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'web', isNativePlatform: () => false },
}));
vi.mock('@/utils/appVersion', () => ({ getAppVersion: () => Promise.resolve('1.0.0') }));

import { reportClientError } from './clientLog';

describe('reportClientError (audit T-34)', () => {
  const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockClear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('identifies the reporter via the access token, never by an email in the body', () => {
    localStorage.setItem('accessToken', 'tok-123');
    reportClientError({ message: 'boom-with-token' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-123');
    expect(JSON.parse(init.body as string)).not.toHaveProperty('userEmail');
  });

  it('sends anonymously when logged out', () => {
    reportClientError({ message: 'boom-anon' });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});
