import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, isEncrypted } from './encryption.util';

describe('Encryption Utility', () => {
  const ENCRYPTION_KEY = 'test-key-for-encryption-testing!';

  describe('encrypt/decrypt round-trip', () => {
    it('should encrypt and decrypt latitude correctly', () => {
      const latitude = '-6.2088';
      const encrypted = encrypt(latitude, ENCRYPTION_KEY);
      const decrypted = decrypt(encrypted, ENCRYPTION_KEY);

      expect(decrypted).toBe(latitude);
    });

    it('should encrypt and decrypt longitude correctly', () => {
      const longitude = '106.8456';
      const encrypted = encrypt(longitude, ENCRYPTION_KEY);
      const decrypted = decrypt(encrypted, ENCRYPTION_KEY);

      expect(decrypted).toBe(longitude);
    });

    it('should produce different ciphertext for same plaintext (due to random IV)', () => {
      const value = '-6.2088';
      const encrypted1 = encrypt(value, ENCRYPTION_KEY);
      const encrypted2 = encrypt(value, ENCRYPTION_KEY);

      // Different IVs should produce different ciphertext
      expect(encrypted1.equals(encrypted2)).toBe(false);

      // But both should decrypt to the same value
      expect(decrypt(encrypted1, ENCRYPTION_KEY)).toBe(value);
      expect(decrypt(encrypted2, ENCRYPTION_KEY)).toBe(value);
    });

    it('should handle negative coordinates', () => {
      const value = '-33.8688';
      const encrypted = encrypt(value, ENCRYPTION_KEY);
      const decrypted = decrypt(encrypted, ENCRYPTION_KEY);

      expect(decrypted).toBe(value);
    });

    it('should handle zero coordinates', () => {
      const value = '0.0';
      const encrypted = encrypt(value, ENCRYPTION_KEY);
      const decrypted = decrypt(encrypted, ENCRYPTION_KEY);

      expect(decrypted).toBe(value);
    });

    it('should handle high precision coordinates', () => {
      const value = '-6.208763421';
      const encrypted = encrypt(value, ENCRYPTION_KEY);
      const decrypted = decrypt(encrypted, ENCRYPTION_KEY);

      expect(decrypted).toBe(value);
    });
  });

  describe('encrypted data is not readable as plain text', () => {
    it('should produce buffer that does not contain plain text coordinate', () => {
      const latitude = '-6.2088';
      const encrypted = encrypt(latitude, ENCRYPTION_KEY);

      // The encrypted buffer should NOT contain the plain text value
      const asString = encrypted.toString('utf8');
      expect(asString).not.toContain(latitude);
    });

    it('should produce buffer that is not a valid coordinate string', () => {
      const longitude = '106.8456';
      const encrypted = encrypt(longitude, ENCRYPTION_KEY);

      const asString = encrypted.toString('utf8');
      const coordPattern = /^-?\d+\.\d+$/;
      expect(coordPattern.test(asString.trim())).toBe(false);
    });
  });

  describe('isEncrypted', () => {
    it('should return true for encrypted data', () => {
      const encrypted = encrypt('-6.2088', ENCRYPTION_KEY);
      expect(isEncrypted(encrypted)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isEncrypted(null)).toBe(false);
    });

    it('should return false for plain text coordinate stored as buffer', () => {
      const plainBuffer = Buffer.from('-6.2088', 'utf8');
      expect(isEncrypted(plainBuffer)).toBe(false);
    });

    it('should return false for very short buffer', () => {
      const shortBuffer = Buffer.from('abc');
      expect(isEncrypted(shortBuffer)).toBe(false);
    });
  });

  describe('decryption with wrong key', () => {
    it('should throw or produce garbage with wrong key', () => {
      const encrypted = encrypt('-6.2088', ENCRYPTION_KEY);

      expect(() => {
        decrypt(encrypted, 'wrong-key-that-is-different!!!');
      }).toThrow();
    });
  });
});
