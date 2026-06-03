import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

/**
 * Encrypt a value using AES-256-CBC.
 * The IV is prepended to the ciphertext for storage.
 */
export function encrypt(value: string, encryptionKey: string): Buffer {
  const key = deriveKey(encryptionKey);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  // Prepend IV to ciphertext
  return Buffer.concat([iv, encrypted]);
}

/**
 * Decrypt a value that was encrypted with AES-256-CBC.
 * Expects the IV to be prepended to the ciphertext.
 */
export function decrypt(encryptedBuffer: Buffer, encryptionKey: string): string {
  const key = deriveKey(encryptionKey);
  const iv = encryptedBuffer.subarray(0, IV_LENGTH);
  const ciphertext = encryptedBuffer.subarray(IV_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Check if a buffer contains encrypted data (not plain text coordinates).
 * Encrypted data with AES-256-CBC will have at least IV_LENGTH + 16 bytes (one block).
 */
export function isEncrypted(buffer: Buffer | null): boolean {
  if (!buffer || buffer.length < IV_LENGTH + 16) {
    return false;
  }
  // Try to parse as plain text - if it looks like a coordinate, it's not encrypted
  const asString = buffer.toString('utf8');
  const coordPattern = /^-?\d+\.\d+$/;
  return !coordPattern.test(asString.trim());
}

/**
 * Derive a 32-byte key from the provided encryption key string.
 */
function deriveKey(encryptionKey: string): Buffer {
  return crypto.createHash('sha256').update(encryptionKey).digest();
}
