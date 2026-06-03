/**
 * Registration validators - pure functions for input validation
 */

/**
 * Validates password strength:
 * - Minimum 8 characters
 * - At least 1 uppercase letter
 * - At least 1 digit
 */
export function isValidPassword(password: string): boolean {
  if (!password || password.length < 8) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/\d/.test(password)) return false;
  return true;
}

/**
 * Validates email format using a standard regex pattern
 */
export function isValidEmail(email: string): boolean {
  if (!email) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validates Indonesian phone number format:
 * - Starts with 08 or +628
 * - 10-13 digits after prefix (total 12-15 chars for +628, 11-14 for 08)
 * - Only digits allowed (after optional + prefix)
 */
export function isValidIndonesianPhone(phone: string): boolean {
  if (!phone) return false;
  // Format: 08xxxxxxxxxx (10-13 digits total) or +628xxxxxxxxxx (12-15 chars total)
  const phoneRegex = /^(\+628\d{8,11}|08\d{8,11})$/;
  return phoneRegex.test(phone);
}

/**
 * Validates profile age field:
 * - Must be a number
 * - Between 13 and 120 inclusive
 */
export function isValidAge(age: number): boolean {
  if (age === null || age === undefined) return false;
  if (!Number.isInteger(age)) return false;
  return age >= 13 && age <= 120;
}

/**
 * Validates gender field
 */
export function isValidGender(gender: string): boolean {
  return ['male', 'female', 'other'].includes(gender);
}

/**
 * Validates a non-empty string field (occupation, city, province)
 */
export function isValidStringField(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  return value.trim().length > 0;
}

/**
 * Validates all profile fields together
 */
export function isValidProfile(profile: {
  age: number;
  gender: string;
  occupation: string;
  city: string;
  province: string;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!isValidAge(profile.age)) {
    errors.push('Age must be an integer between 13 and 120');
  }
  if (!isValidGender(profile.gender)) {
    errors.push('Gender must be male, female, or other');
  }
  if (!isValidStringField(profile.occupation)) {
    errors.push('Occupation is required');
  }
  if (!isValidStringField(profile.city)) {
    errors.push('City is required');
  }
  if (!isValidStringField(profile.province)) {
    errors.push('Province is required');
  }

  return { valid: errors.length === 0, errors };
}
