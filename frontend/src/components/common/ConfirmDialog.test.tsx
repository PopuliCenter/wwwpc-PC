import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useConfirm } from './ConfirmDialog';

function Harness({ onResult }: { onResult: (ok: boolean) => void }) {
  const { confirm, dialog } = useConfirm();
  return (
    <>
      <button type="button" onClick={() => void confirm({ message: 'Hapus?' }).then(onResult)}>
        Pemicu
      </button>
      <button type="button">Tombol di belakang</button>
      {dialog}
    </>
  );
}

function open() {
  const onResult = vi.fn();
  render(<Harness onResult={onResult} />);
  const trigger = screen.getByRole('button', { name: 'Pemicu' });
  trigger.focus();
  fireEvent.click(trigger);
  return { onResult, trigger };
}

describe('useConfirm: keyboard', () => {
  it('fokus masuk ke tombol Batal saat dialog terbuka', () => {
    open();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Batal' }));
  });

  it('Tab dan Shift+Tab terkurung di antara tombol dialog', () => {
    open();
    const dialog = screen.getByRole('alertdialog');
    const cancel = screen.getByRole('button', { name: 'Batal' });
    const ok = screen.getByRole('button', { name: 'Ya, lanjutkan' });

    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(ok);

    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(cancel);
  });

  it('Esc membatalkan dan fokus kembali ke pemicu', async () => {
    const { onResult, trigger } = open();
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    await vi.waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('tombol konfirmasi tetap mengembalikan true', async () => {
    const { onResult } = open();
    fireEvent.click(screen.getByRole('button', { name: 'Ya, lanjutkan' }));
    await vi.waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
  });
});
