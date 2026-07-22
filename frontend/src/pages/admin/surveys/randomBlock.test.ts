import { describe, it, expect } from 'vitest';
import { collectBlocks, findBlockConflicts, summarizeRanges } from './RandomBlockPanel';
import type { Question } from './surveyEditTypes';

/** Bikin daftar pertanyaan: n buah, semuanya di luar blok. */
function makeQuestions(n: number): Question[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `q${i + 1}`,
    type: 'single_choice' as const,
    text: `Pertanyaan ${i + 1}`,
    required: false,
    order: i,
    randomizeGroup: null,
    pinPosition: false,
  }));
}

/** Tempelkan nama blok ke rentang nomor (1-based, inklusif) — meniru panel. */
function assignRange(questions: Question[], from: number, to: number, name: string): Question[] {
  return questions.map((q, i) =>
    i + 1 >= from && i + 1 <= to ? { ...q, randomizeGroup: name } : q,
  );
}

describe('summarizeRanges', () => {
  it('menggabungkan nomor berurutan jadi rentang', () => {
    expect(summarizeRanges([1, 2, 3, 4, 5])).toBe('1–5');
  });

  it('memisahkan kelompok yang tidak bersambung', () => {
    expect(summarizeRanges([1, 2, 3, 7, 8, 12])).toBe('1–3, 7–8, 12');
  });

  it('menampilkan nomor tunggal apa adanya', () => {
    expect(summarizeRanges([4])).toBe('4');
  });

  it('mengurutkan dulu bila masukan acak', () => {
    expect(summarizeRanges([9, 2, 1, 10, 3])).toBe('1–3, 9–10');
  });

  it('menangani daftar kosong', () => {
    expect(summarizeRanges([])).toBe('—');
  });
});

describe('collectBlocks — beberapa blok sekaligus', () => {
  it('mengenali tiga rentang terpisah sebagai tiga blok', () => {
    // Skenario yang ditanyakan: 10–50, 58–70, 90–100 diacak sendiri-sendiri.
    let questions = makeQuestions(100);
    questions = assignRange(questions, 10, 50, 'Blok A');
    questions = assignRange(questions, 58, 70, 'Blok B');
    questions = assignRange(questions, 90, 100, 'Blok C');

    const blocks = collectBlocks(questions);

    expect(blocks.map((b) => b.name)).toEqual(['Blok A', 'Blok B', 'Blok C']);
    expect(summarizeRanges(blocks[0].positions)).toBe('10–50');
    expect(summarizeRanges(blocks[1].positions)).toBe('58–70');
    expect(summarizeRanges(blocks[2].positions)).toBe('90–100');
    expect(blocks[0].positions).toHaveLength(41);
    expect(blocks[1].positions).toHaveLength(13);
    expect(blocks[2].positions).toHaveLength(11);
  });

  it('pertanyaan di luar blok tidak ikut terdaftar', () => {
    let questions = makeQuestions(100);
    questions = assignRange(questions, 10, 50, 'Blok A');
    const anggota = collectBlocks(questions).flatMap((b) => b.positions);
    // 1–9 (data diri) dan 51–100 tetap di luar blok.
    expect(anggota).not.toContain(1);
    expect(anggota).not.toContain(9);
    expect(anggota).not.toContain(51);
  });

  it('dua rentang bernama sama digabung jadi satu blok', () => {
    let questions = makeQuestions(30);
    questions = assignRange(questions, 5, 8, 'Elektabilitas');
    questions = assignRange(questions, 20, 22, 'Elektabilitas');

    const blocks = collectBlocks(questions);
    expect(blocks).toHaveLength(1);
    expect(summarizeRanges(blocks[0].positions)).toBe('5–8, 20–22');
  });

  it('mengurutkan blok menurut posisi anggota pertamanya', () => {
    let questions = makeQuestions(50);
    questions = assignRange(questions, 40, 45, 'Zeta');
    questions = assignRange(questions, 5, 9, 'Alfa');
    expect(collectBlocks(questions).map((b) => b.name)).toEqual(['Alfa', 'Zeta']);
  });

  it('menghitung anggota yang dikunci posisinya', () => {
    let questions = makeQuestions(10);
    questions = assignRange(questions, 2, 6, 'Blok A');
    questions[3] = { ...questions[3], pinPosition: true };
    expect(collectBlocks(questions)[0].pinnedCount).toBe(1);
  });

  it('mengabaikan nama blok yang hanya berisi spasi', () => {
    const questions = makeQuestions(3).map((q) => ({ ...q, randomizeGroup: '   ' }));
    expect(collectBlocks(questions)).toHaveLength(0);
  });
});

describe('findBlockConflicts', () => {
  it('tidak melaporkan apa pun untuk survei tanpa aturan logika', () => {
    let questions = makeQuestions(20);
    questions = assignRange(questions, 5, 15, 'Blok A');
    expect(findBlockConflicts(questions)).toEqual([]);
  });

  it('meloloskan syarat dari pertanyaan di LUAR blok', () => {
    let questions = makeQuestions(20);
    questions = assignRange(questions, 5, 15, 'Blok A');
    // No. 10 (dalam blok) bergantung pada no. 2 (di luar blok) — selalu aman.
    questions[9] = {
      ...questions[9],
      skipLogicRules: [
        { sourceQuestionId: 'q2', operator: 'equals', conditionValue: 'ya', action: 'skip' },
      ],
    };
    expect(findBlockConflicts(questions)).toEqual([]);
  });

  it('melaporkan syarat yang sekelompok dengan pemiliknya', () => {
    let questions = makeQuestions(20);
    questions = assignRange(questions, 5, 15, 'Blok A');
    questions[9] = {
      ...questions[9],
      skipLogicRules: [
        { sourceQuestionId: 'q7', operator: 'equals', conditionValue: 'ya', action: 'skip' },
      ],
    };
    const conflicts = findBlockConflicts(questions);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toContain('No. 10');
    expect(conflicts[0]).toContain('no. 7');
    expect(conflicts[0]).toContain('Blok A');
  });

  it('meloloskan pasangan sekelompok bila keduanya dikunci', () => {
    let questions = makeQuestions(20);
    questions = assignRange(questions, 5, 15, 'Blok A');
    questions[6] = { ...questions[6], pinPosition: true };
    questions[9] = {
      ...questions[9],
      pinPosition: true,
      skipLogicRules: [
        { sourceQuestionId: 'q7', operator: 'equals', conditionValue: 'ya', action: 'skip' },
      ],
    };
    expect(findBlockConflicts(questions)).toEqual([]);
  });

  it('melaporkan titik awal jump_to yang ikut diacak', () => {
    let questions = makeQuestions(20);
    questions = assignRange(questions, 5, 15, 'Blok A');
    questions[9] = {
      ...questions[9],
      skipLogicRules: [
        {
          sourceQuestionId: 'q2',
          operator: 'equals',
          conditionValue: 'ya',
          action: 'jump_to',
          targetQuestionId: 'q18',
        },
      ],
    };
    expect(findBlockConflicts(questions).some((c) => c.includes('lompatan'))).toBe(true);
  });

  it('melaporkan tujuan jump_to yang ikut diacak', () => {
    let questions = makeQuestions(20);
    questions = assignRange(questions, 5, 15, 'Blok A');
    // Pemilik (no. 2) di luar blok, tapi tujuannya (no. 8) ada di dalam blok.
    questions[1] = {
      ...questions[1],
      skipLogicRules: [
        {
          sourceQuestionId: 'q1',
          operator: 'equals',
          conditionValue: 'ya',
          action: 'jump_to',
          targetQuestionId: 'q8',
        },
      ],
    };
    const conflicts = findBlockConflicts(questions);
    expect(conflicts.some((c) => c.includes('Tujuan lompatan'))).toBe(true);
  });

  it('memakai aturan visibilitas sebagai ketergantungan juga', () => {
    let questions = makeQuestions(20);
    questions = assignRange(questions, 5, 15, 'Blok A');
    questions[9] = {
      ...questions[9],
      visibilityRules: [
        {
          sourceQuestionId: 'q6',
          operator: 'equals',
          conditionValue: 'ya',
          visibilityAction: 'show',
        },
      ],
    };
    expect(findBlockConflicts(questions)).toHaveLength(1);
  });

  it('meloloskan blok BERBEDA — antar blok urutannya tetap pasti', () => {
    let questions = makeQuestions(100);
    questions = assignRange(questions, 10, 50, 'Blok A');
    questions = assignRange(questions, 58, 70, 'Blok B');
    // No. 60 (Blok B) bergantung pada no. 20 (Blok A) — Blok A selalu selesai
    // lebih dulu karena slotnya semua di depan.
    questions[59] = {
      ...questions[59],
      skipLogicRules: [
        { sourceQuestionId: 'q20', operator: 'equals', conditionValue: 'ya', action: 'skip' },
      ],
    };
    expect(findBlockConflicts(questions)).toEqual([]);
  });

  it('tidak menduplikasi pesan yang sama', () => {
    let questions = makeQuestions(20);
    questions = assignRange(questions, 5, 15, 'Blok A');
    const rule = {
      sourceQuestionId: 'q7',
      operator: 'equals' as const,
      conditionValue: 'ya',
      action: 'skip' as const,
    };
    questions[9] = { ...questions[9], skipLogicRules: [rule, rule, rule] };
    expect(findBlockConflicts(questions)).toHaveLength(1);
  });
});
