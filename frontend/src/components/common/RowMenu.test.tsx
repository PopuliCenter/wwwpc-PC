import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RowMenu } from './RowMenu';

describe('RowMenu', () => {
  it('tidak merender apa pun bila semua item kosong', () => {
    const { container } = render(<RowMenu items={[false, null, undefined]} />);
    expect(container.firstChild).toBeNull();
  });

  it('membuka menu, menjalankan aksi, menutup, dan tidak memicu klik baris', () => {
    const onRow = vi.fn();
    const onDup = vi.fn();
    render(
      <div onClick={onRow}>
        <RowMenu items={[{ label: 'Duplikat', onClick: onDup }, false]} />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Aksi lainnya' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplikat' }));
    expect(onDup).toHaveBeenCalledOnce();
    expect(onRow).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('Esc menutup menu tanpa menjalankan aksi', () => {
    const onDup = vi.fn();
    render(<RowMenu items={[{ label: 'Duplikat', onClick: onDup }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Aksi lainnya' }));
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(onDup).not.toHaveBeenCalled();
  });

  it('item nonaktif tidak bisa dijalankan', () => {
    const onDup = vi.fn();
    render(<RowMenu items={[{ label: 'Duplikat', onClick: onDup, disabled: true }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Aksi lainnya' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplikat' }));
    expect(onDup).not.toHaveBeenCalled();
  });
});
