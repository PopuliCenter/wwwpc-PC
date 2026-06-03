import { describe, it, expect } from 'vitest';
import { evaluateCondition, ConditionOperator } from './condition-evaluator';

describe('ConditionEvaluator', () => {
  describe('equals operator', () => {
    it('should return true for exact string match', () => {
      expect(evaluateCondition('equals', 'yes', 'yes')).toBe(true);
    });

    it('should return false for string mismatch', () => {
      expect(evaluateCondition('equals', 'yes', 'no')).toBe(false);
    });

    it('should return true for numeric match', () => {
      expect(evaluateCondition('equals', '5', 5)).toBe(true);
    });

    it('should return false for numeric mismatch', () => {
      expect(evaluateCondition('equals', '5', 3)).toBe(false);
    });

    it('should return true if array contains the value (multiple choice)', () => {
      expect(evaluateCondition('equals', 'option_a', ['option_a', 'option_b'])).toBe(true);
    });

    it('should return false if array does not contain the value', () => {
      expect(evaluateCondition('equals', 'option_c', ['option_a', 'option_b'])).toBe(false);
    });

    it('should return false for null actual value', () => {
      expect(evaluateCondition('equals', 'yes', null)).toBe(false);
    });

    it('should return false for undefined actual value', () => {
      expect(evaluateCondition('equals', 'yes', undefined)).toBe(false);
    });
  });

  describe('not_equals operator', () => {
    it('should return false for exact string match', () => {
      expect(evaluateCondition('not_equals', 'yes', 'yes')).toBe(false);
    });

    it('should return true for string mismatch', () => {
      expect(evaluateCondition('not_equals', 'yes', 'no')).toBe(true);
    });

    it('should return false for numeric match', () => {
      expect(evaluateCondition('not_equals', '5', 5)).toBe(false);
    });

    it('should return true for numeric mismatch', () => {
      expect(evaluateCondition('not_equals', '5', 3)).toBe(true);
    });

    it('should return false if array contains the value', () => {
      expect(evaluateCondition('not_equals', 'option_a', ['option_a', 'option_b'])).toBe(false);
    });

    it('should return true if array does not contain the value', () => {
      expect(evaluateCondition('not_equals', 'option_c', ['option_a', 'option_b'])).toBe(true);
    });

    it('should return false for null actual value', () => {
      expect(evaluateCondition('not_equals', 'yes', null)).toBe(false);
    });
  });

  describe('contains operator', () => {
    it('should return true for substring match', () => {
      expect(evaluateCondition('contains', 'hello', 'say hello world')).toBe(true);
    });

    it('should return false for no substring match', () => {
      expect(evaluateCondition('contains', 'xyz', 'say hello world')).toBe(false);
    });

    it('should return true if array contains the element', () => {
      expect(evaluateCondition('contains', 'b', ['a', 'b', 'c'])).toBe(true);
    });

    it('should return false if array does not contain the element', () => {
      expect(evaluateCondition('contains', 'z', ['a', 'b', 'c'])).toBe(false);
    });

    it('should handle numeric values converted to string', () => {
      expect(evaluateCondition('contains', '12', 123)).toBe(true);
    });

    it('should return false for null actual value', () => {
      expect(evaluateCondition('contains', 'test', null)).toBe(false);
    });
  });

  describe('greater_than operator', () => {
    it('should return true when actual is greater than condition', () => {
      expect(evaluateCondition('greater_than', '5', 10)).toBe(true);
    });

    it('should return false when actual equals condition', () => {
      expect(evaluateCondition('greater_than', '5', 5)).toBe(false);
    });

    it('should return false when actual is less than condition', () => {
      expect(evaluateCondition('greater_than', '5', 3)).toBe(false);
    });

    it('should handle string numeric values', () => {
      expect(evaluateCondition('greater_than', '5', '10')).toBe(true);
    });

    it('should return false for non-numeric strings', () => {
      expect(evaluateCondition('greater_than', '5', 'abc')).toBe(false);
    });

    it('should return false for arrays', () => {
      expect(evaluateCondition('greater_than', '5', ['10', '20'])).toBe(false);
    });

    it('should return false for null actual value', () => {
      expect(evaluateCondition('greater_than', '5', null)).toBe(false);
    });
  });

  describe('less_than operator', () => {
    it('should return true when actual is less than condition', () => {
      expect(evaluateCondition('less_than', '10', 5)).toBe(true);
    });

    it('should return false when actual equals condition', () => {
      expect(evaluateCondition('less_than', '5', 5)).toBe(false);
    });

    it('should return false when actual is greater than condition', () => {
      expect(evaluateCondition('less_than', '5', 10)).toBe(false);
    });

    it('should handle string numeric values', () => {
      expect(evaluateCondition('less_than', '10', '5')).toBe(true);
    });

    it('should return false for non-numeric strings', () => {
      expect(evaluateCondition('less_than', '5', 'abc')).toBe(false);
    });

    it('should return false for arrays', () => {
      expect(evaluateCondition('less_than', '5', ['1', '2'])).toBe(false);
    });

    it('should return false for null actual value', () => {
      expect(evaluateCondition('less_than', '5', null)).toBe(false);
    });
  });

  describe('unknown operator', () => {
    it('should return false for unknown operator', () => {
      expect(evaluateCondition('unknown' as ConditionOperator, 'val', 'val')).toBe(false);
    });
  });
});
