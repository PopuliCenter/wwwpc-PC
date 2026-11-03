import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QuestionRenderer } from '../SurveyFillPage';
import type { AnswerValue, Question } from '@/types/survey';

// Mengunci janji perombakan tampilan: nilai yang dikirim dan urutan opsi tidak berubah.
function setup(question: Partial<Question>, value: AnswerValue = null) {
  const onChange = vi.fn();
  const full: Question = {
    id: 'q1',
    type: 'short_text',
    text: 'Pertanyaan',
    required: false,
    page: 1,
    ...question,
  };
  const view = render(
    <QuestionRenderer question={full} value={value} onChange={onChange} surveyId="s1" />,
  );
  return { onChange, ...view };
}

describe('QuestionRenderer: matriks Likert', () => {
  const matrix = {
    type: 'matrix_likert' as const,
    matrixRows: ['Harga', 'Layanan'],
    matrixColumns: ['Tidak setuju', 'Netral', 'Setuju'],
  };

  it('tumpukan HP mengirim nilai yang sama dengan tabel, dalam urutan opsi yang sama', () => {
    const { onChange, container } = setup(matrix, { Layanan: 'Netral' });

    const group = screen.getByRole('group', { name: 'Harga' });
    const labels = within(group)
      .getAllByRole('radio')
      .map((r) => r.closest('label')?.textContent);
    expect(labels).toEqual(['Tidak setuju', 'Netral', 'Setuju']);

    fireEvent.click(within(group).getByLabelText('Setuju'));
    expect(onChange).toHaveBeenLastCalledWith({ Layanan: 'Netral', Harga: 'Setuju' });

    fireEvent.click(within(container.querySelector('table')!).getByLabelText('Harga - Setuju'));
    expect(onChange).toHaveBeenLastCalledWith({ Layanan: 'Netral', Harga: 'Setuju' });
  });

  it('grup radio tumpukan dan tabel memakai name berbeda agar tidak saling membatalkan', () => {
    const { container } = setup(matrix, { Harga: 'Netral' });
    const checked = container.querySelectorAll<HTMLInputElement>('input[type="radio"]:checked');
    expect(checked).toHaveLength(2);
    expect(checked[0].name).not.toBe(checked[1].name);
  });
});

describe('QuestionRenderer: skala angka', () => {
  it('skala numerik tetap bisa dibatalkan dengan ketuk ulang', () => {
    const { onChange } = setup({ type: 'numeric_scale', scaleMin: 1, scaleMax: 5 }, '3');
    fireEvent.click(screen.getByRole('radio', { name: '3' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
    fireEvent.click(screen.getByRole('radio', { name: '4' }));
    expect(onChange).toHaveBeenLastCalledWith('4');
  });

  it('rating angka tetap tidak bisa dibatalkan', () => {
    const { onChange } = setup(
      { type: 'rating_scale', ratingConfig: { ratingMax: 5, ratingDisplayMode: 'number' } },
      '3',
    );
    fireEvent.click(screen.getByRole('radio', { name: '3' }));
    expect(onChange).toHaveBeenLastCalledWith('3');
  });

  it('rating bintang mengirim nomor bintang sebagai teks', () => {
    const { onChange } = setup({
      type: 'rating_scale',
      ratingConfig: { ratingMax: 5, ratingDisplayMode: 'star' },
    });
    fireEvent.click(screen.getByRole('radio', { name: '4 bintang' }));
    expect(onChange).toHaveBeenLastCalledWith('4');
  });
});

describe('QuestionRenderer: pilihan tunggal', () => {
  it('urutan opsi mengikuti data bila pengacakan tidak aktif', () => {
    setup({
      type: 'single_choice',
      options: [
        { id: 'a', label: 'Satu', value: '1' },
        { id: 'b', label: 'Dua', value: '2' },
        { id: 'c', label: 'Tiga', value: '3' },
      ],
    });
    expect(screen.getAllByRole('radio').map((r) => r.closest('label')?.textContent)).toEqual([
      'Satu',
      'Dua',
      'Tiga',
    ]);
  });
});
