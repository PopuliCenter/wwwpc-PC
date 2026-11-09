import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NotificationBell } from './NotificationBell';
import { announceFeedRead, requestFeedRefresh } from '@/services/notificationFeed';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/services/api', () => ({ api: mocks }));

let unreadCount = 0;
let feed: unknown[] = [];

function renderBell() {
  return render(
    <MemoryRouter>
      <NotificationBell />
    </MemoryRouter>,
  );
}

describe('NotificationBell', () => {
  beforeEach(() => {
    unreadCount = 0;
    feed = [];
    mocks.get.mockImplementation((url: string) =>
      Promise.resolve(url.endsWith('unread-count') ? { count: unreadCount } : feed),
    );
    mocks.post.mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('badge bertambah saat feed diminta segar (push masuk), lalu nol saat ditandai dibaca', async () => {
    renderBell();
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('2')).toBeNull();

    unreadCount = 2;
    act(() => requestFeedRefresh());
    expect(await screen.findByText('2')).toBeInTheDocument();

    act(() => announceFeedRead());
    await waitFor(() => expect(screen.queryByText('2')).toBeNull());
  });

  it('pengingat survei tampil di panel dan ketukannya ditangani seperti tipe lain', async () => {
    feed = [
      {
        id: 'n1',
        type: 'survey_reminder',
        title: 'Survei segera ditutup',
        body: 'Sisa 1 hari lagi',
        link: '/surveys/abc/fill',
        readAt: null,
        createdAt: new Date().toISOString(),
      },
    ];
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: 'Notifikasi' }));
    expect(await screen.findByText('Survei segera ditutup')).toBeInTheDocument();
    // Panel terbuka = sudah dilihat → ditandai dibaca.
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/notifications/feed/read', {}));

    fireEvent.click(screen.getByText('Survei segera ditutup'));
    expect(screen.queryByText('Survei segera ditutup')).toBeNull();
  });
});
