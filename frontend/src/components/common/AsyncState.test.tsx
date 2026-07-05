import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AsyncState } from './AsyncState';

describe('AsyncState', () => {
  it('menampilkan loading (dgn teks) saat loading', () => {
    render(
      <AsyncState loading loadingText="Memuat survei...">
        <div>konten</div>
      </AsyncState>,
    );
    expect(screen.getByText('Memuat survei...')).toBeInTheDocument();
    expect(screen.queryByText('konten')).not.toBeInTheDocument();
  });

  it('menampilkan error + tombol Coba lagi, dan memanggil onRetry', () => {
    const onRetry = vi.fn();
    render(
      <AsyncState error="Gagal memuat" onRetry={onRetry}>
        <div>konten</div>
      </AsyncState>,
    );
    expect(screen.getByText('Gagal memuat')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Coba lagi'));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.queryByText('konten')).not.toBeInTheDocument();
  });

  it('tanpa onRetry → tidak ada tombol Coba lagi', () => {
    render(
      <AsyncState error="Oops">
        <div>konten</div>
      </AsyncState>,
    );
    expect(screen.queryByText('Coba lagi')).not.toBeInTheDocument();
  });

  it('menampilkan pesan kosong saat isEmpty', () => {
    render(
      <AsyncState isEmpty emptyText="Belum ada data.">
        <div>konten</div>
      </AsyncState>,
    );
    expect(screen.getByText('Belum ada data.')).toBeInTheDocument();
    expect(screen.queryByText('konten')).not.toBeInTheDocument();
  });

  it('menampilkan konten saat tidak loading/error/kosong', () => {
    render(
      <AsyncState>
        <div>konten</div>
      </AsyncState>,
    );
    expect(screen.getByText('konten')).toBeInTheDocument();
  });

  it('prioritas: loading menang atas error & isEmpty', () => {
    render(
      <AsyncState loading error="err" isEmpty>
        <div>konten</div>
      </AsyncState>,
    );
    expect(screen.getByText('Memuat...')).toBeInTheDocument();
    expect(screen.queryByText('err')).not.toBeInTheDocument();
  });
});
