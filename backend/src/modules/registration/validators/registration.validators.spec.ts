import { describe, it, expect } from 'vitest';
import {
  isValidPassword,
  isValidEmail,
  isValidIndonesianPhone,
  isValidAge,
  isValidGender,
  isValidStringField,
  isValidProfile,
} from './registration.validators';

describe('Registration Validators', () => {
  describe('isValidPassword', () => {
    it('should return true for valid password with 8+ chars, uppercase, and digit', () => {
      expect(isValidPassword('ValidP4ss')).toBe(true);
      expect(isValidPassword('Abcdefg1')).toBe(true);
      expect(isValidPassword('MyStr0ngPassword')).toBe(true);
    });

    it('should return false for password shorter than 8 characters', () => {
      expect(isValidPassword('Ab1')).toBe(false);
      expect(isValidPassword('Short1A')).toBe(false);
    });

    it('should return false for password without uppercase letter', () => {
      expect(isValidPassword('lowercase1')).toBe(false);
      expect(isValidPassword('nouppercase123')).toBe(false);
    });

    it('should return false for password without digit', () => {
      expect(isValidPassword('NoDigitHere')).toBe(false);
      expect(isValidPassword('AllLetters')).toBe(false);
    });

    it('should return false for empty or null-like input', () => {
      expect(isValidPassword('')).toBe(false);
      expect(isValidPassword(null as any)).toBe(false);
      expect(isValidPassword(undefined as any)).toBe(false);
    });
  });

  describe('isValidEmail', () => {
    it('should return true for valid email formats', () => {
      expect(isValidEmail('user@example.com')).toBe(true);
      expect(isValidEmail('test.user@domain.co.id')).toBe(true);
      expect(isValidEmail('name+tag@gmail.com')).toBe(true);
    });

    it('should return false for invalid email formats', () => {
      expect(isValidEmail('notanemail')).toBe(false);
      expect(isValidEmail('@domain.com')).toBe(false);
      expect(isValidEmail('user@')).toBe(false);
      expect(isValidEmail('user @domain.com')).toBe(false);
    });

    it('should return false for empty or null-like input', () => {
      expect(isValidEmail('')).toBe(false);
      expect(isValidEmail(null as any)).toBe(false);
      expect(isValidEmail(undefined as any)).toBe(false);
    });
  });

  describe('isValidIndonesianPhone', () => {
    it('should return true for valid 08xx format', () => {
      expect(isValidIndonesianPhone('081234567890')).toBe(true);
      expect(isValidIndonesianPhone('08123456789')).toBe(true);
      expect(isValidIndonesianPhone('0812345678901')).toBe(true);
    });

    it('should return true for valid +628xx format', () => {
      expect(isValidIndonesianPhone('+6281234567890')).toBe(true);
      expect(isValidIndonesianPhone('+628123456789')).toBe(true);
      expect(isValidIndonesianPhone('+62812345678901')).toBe(true);
    });

    it('should return false for invalid phone formats', () => {
      expect(isValidIndonesianPhone('12345')).toBe(false);
      expect(isValidIndonesianPhone('+1234567890')).toBe(false);
      expect(isValidIndonesianPhone('0712345678')).toBe(false);
      expect(isValidIndonesianPhone('08abc')).toBe(false);
    });

    it('should return false for too short or too long numbers', () => {
      expect(isValidIndonesianPhone('081234567')).toBe(false); // too short
      expect(isValidIndonesianPhone('081234567890123')).toBe(false); // too long
    });

    it('should return false for empty or null-like input', () => {
      expect(isValidIndonesianPhone('')).toBe(false);
      expect(isValidIndonesianPhone(null as any)).toBe(false);
      expect(isValidIndonesianPhone(undefined as any)).toBe(false);
    });
  });

  describe('isValidAge', () => {
    it('should return true for valid ages (13-120)', () => {
      expect(isValidAge(13)).toBe(true);
      expect(isValidAge(25)).toBe(true);
      expect(isValidAge(120)).toBe(true);
    });

    it('should return false for ages below 13', () => {
      expect(isValidAge(12)).toBe(false);
      expect(isValidAge(0)).toBe(false);
      expect(isValidAge(-1)).toBe(false);
    });

    it('should return false for ages above 120', () => {
      expect(isValidAge(121)).toBe(false);
      expect(isValidAge(200)).toBe(false);
    });

    it('should return false for non-integer values', () => {
      expect(isValidAge(25.5)).toBe(false);
      expect(isValidAge(NaN)).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isValidAge(null as any)).toBe(false);
      expect(isValidAge(undefined as any)).toBe(false);
    });
  });

  describe('isValidGender', () => {
    it('should return true for valid gender values', () => {
      expect(isValidGender('male')).toBe(true);
      expect(isValidGender('female')).toBe(true);
      expect(isValidGender('other')).toBe(true);
    });

    it('should return false for invalid gender values', () => {
      expect(isValidGender('invalid')).toBe(false);
      expect(isValidGender('')).toBe(false);
      expect(isValidGender('Male')).toBe(false); // case-sensitive
    });
  });

  describe('isValidStringField', () => {
    it('should return true for non-empty strings', () => {
      expect(isValidStringField('Jakarta')).toBe(true);
      expect(isValidStringField('Software Engineer')).toBe(true);
    });

    it('should return false for empty or whitespace-only strings', () => {
      expect(isValidStringField('')).toBe(false);
      expect(isValidStringField('   ')).toBe(false);
    });

    it('should return false for non-string values', () => {
      expect(isValidStringField(null as any)).toBe(false);
      expect(isValidStringField(undefined as any)).toBe(false);
    });
  });

  describe('isValidProfile', () => {
    const validProfile = {
      age: 25,
      gender: 'male',
      occupation: 'Software Engineer',
      city: 'Jakarta',
      province: 'DKI Jakarta',
    };

    it('should return valid for a complete valid profile', () => {
      const result = isValidProfile(validProfile);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for invalid age', () => {
      const result = isValidProfile({ ...validProfile, age: 10 });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Age must be an integer between 13 and 120');
    });

    it('should return errors for invalid gender', () => {
      const result = isValidProfile({ ...validProfile, gender: 'invalid' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Gender must be male, female, or other');
    });

    it('should return errors for empty occupation', () => {
      const result = isValidProfile({ ...validProfile, occupation: '' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Occupation is required');
    });

    it('should return multiple errors for multiple invalid fields', () => {
      const result = isValidProfile({
        age: 5,
        gender: 'invalid',
        occupation: '',
        city: '',
        province: '',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });
});
