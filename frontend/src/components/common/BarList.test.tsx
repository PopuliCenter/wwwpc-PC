import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BarList } from './BarList';

describe('BarList', () => {
  it('mengurutkan menurun, menampilkan enam teratas, dan menggabung sisanya', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((label, i) => ({
      label,
      count: i + 1,
    }));
    const { container } = render(<BarList items={items} />);
    const rows = Array.from(container.querySelectorAll('li')).map((li) => li.textContent);
    expect(rows).toHaveLength(7);
    expect(rows[0]).toContain('h');
    expect(rows[5]).toContain('c');
    // Lainnya = a + b = 3 dari total 36.
    expect(rows[6]).toContain('Lainnya');
    expect(rows[6]).toContain('3 · 8,3%');
  });

  it('memakai labelMap dan tidak mengubah array masukan', () => {
    const items = [
      { label: 'female', count: 1 },
      { label: 'male', count: 3 },
    ];
    render(<BarList items={items} labelMap={{ male: 'Laki-laki' }} />);
    expect(screen.getByText('Laki-laki')).toBeInTheDocument();
    expect(items[0].label).toBe('female');
  });

  it('menampilkan teks kosong tanpa data, dan aman bila total nol', () => {
    const { rerender } = render(<BarList items={[]} emptyText="Kosong" />);
    expect(screen.getByText('Kosong')).toBeInTheDocument();
    rerender(<BarList items={[{ label: 'x', count: 0 }]} />);
    expect(screen.getByText(/0%/)).toBeInTheDocument();
  });
});
