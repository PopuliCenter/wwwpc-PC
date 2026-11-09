import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type FeedModule = typeof import('./notificationFeed');

// Modul menyimpan status (pendengar, jeda resume) di level modul: muat ulang per tes.
async function loadFeed(): Promise<FeedModule> {
  vi.resetModules();
  return import('./notificationFeed');
}

describe('notificationFeed', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.doUnmock('@capacitor/core');
    vi.doUnmock('@capacitor/app');
  });

  it('menggabungkan permintaan refresh beruntun menjadi satu event changed', async () => {
    const feed = await loadFeed();
    const listener = vi.fn();
    const off = feed.subscribeFeed(listener);

    feed.requestFeedRefresh();
    feed.requestFeedRefresh();
    expect(listener).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('changed');
    off();
  });

  it('announceFeedRead langsung mengirim event read', async () => {
    const feed = await loadFeed();
    const listener = vi.fn();
    const off = feed.subscribeFeed(listener);
    feed.announceFeedRead();
    expect(listener).toHaveBeenCalledWith('read');
    off();
  });

  it('tab kembali terlihat memicu refresh, dengan jeda minimum antar-resume', async () => {
    const feed = await loadFeed();
    const listener = vi.fn();
    const off = feed.subscribeFeed(listener);

    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(300);
    expect(listener).toHaveBeenCalledTimes(1);

    // Bolak-balik cepat diabaikan.
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(300);
    expect(listener).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5_000);
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(300);
    expect(listener).toHaveBeenCalledTimes(2);
    off();
  });

  it('pendengar yang dilepas tidak dipanggil lagi', async () => {
    const feed = await loadFeed();
    const listener = vi.fn();
    const off = feed.subscribeFeed(listener);
    off();
    feed.requestFeedRefresh();
    feed.announceFeedRead();
    vi.advanceTimersByTime(300);
    expect(listener).not.toHaveBeenCalled();
  });

  it('di native, App resume memicu refresh', async () => {
    let resume: (() => void) | undefined;
    vi.doMock('@capacitor/core', () => ({
      Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
    }));
    vi.doMock('@capacitor/app', () => ({
      App: {
        addListener: vi.fn((event: string, cb: () => void) => {
          if (event === 'resume') resume = cb;
          return Promise.resolve({ remove: vi.fn() });
        }),
      },
    }));
    const feed = await loadFeed();
    const listener = vi.fn();
    const off = feed.subscribeFeed(listener);
    await vi.waitFor(() => expect(resume).toBeTypeOf('function'));

    resume?.();
    vi.advanceTimersByTime(300);
    expect(listener).toHaveBeenCalledWith('changed');
    off();
  });
});
