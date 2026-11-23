import { describe, it, expect } from 'vitest';
import { maskEmail } from './mask-email';

describe('maskEmail (audit T-34)', () => {
  it('keeps only the first character and the domain', () => {
    expect(maskEmail('budi.santoso@example.com')).toBe('b***@example.com');
  });
  it('handles empty / malformed input', () => {
    expect(maskEmail(undefined)).toBe('(tanpa email)');
    expect(maskEmail('tanpa-at')).toBe('***');
  });
});
