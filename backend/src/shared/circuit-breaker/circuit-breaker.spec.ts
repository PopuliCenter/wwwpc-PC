import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CircuitBreaker, CircuitBreakerState } from './circuit-breaker';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      name: 'test-breaker',
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 1000,
    });
  });

  describe('initial state', () => {
    it('should start in CLOSED state', () => {
      expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should have zero failure count', () => {
      expect(breaker.getFailureCount()).toBe(0);
    });

    it('should return the configured name', () => {
      expect(breaker.getName()).toBe('test-breaker');
    });
  });

  describe('CLOSED state', () => {
    it('should execute function successfully and remain CLOSED', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await breaker.execute(fn);

      expect(result).toBe('success');
      expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('should increment failure count on error', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      await expect(breaker.execute(fn)).rejects.toThrow('fail');
      expect(breaker.getFailureCount()).toBe(1);
      expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should transition to OPEN after reaching failure threshold', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow('fail');
      }

      expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);
      expect(breaker.getFailureCount()).toBe(3);
    });

    it('should reset failure count on success', async () => {
      const failFn = vi.fn().mockRejectedValue(new Error('fail'));
      const successFn = vi.fn().mockResolvedValue('ok');

      await expect(breaker.execute(failFn)).rejects.toThrow();
      await expect(breaker.execute(failFn)).rejects.toThrow();
      expect(breaker.getFailureCount()).toBe(2);

      await breaker.execute(successFn);
      expect(breaker.getFailureCount()).toBe(0);
    });
  });

  describe('OPEN state', () => {
    beforeEach(async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow();
      }
      expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it('should return fallback value without calling function', async () => {
      const fn = vi.fn().mockResolvedValue('should not be called');
      const result = await breaker.execute(fn, 'fallback-value');

      expect(result).toBe('fallback-value');
      expect(fn).not.toHaveBeenCalled();
    });

    it('should return fallback from function', async () => {
      const fn = vi.fn().mockResolvedValue('should not be called');
      const result = await breaker.execute(fn, () => 'computed-fallback');

      expect(result).toBe('computed-fallback');
      expect(fn).not.toHaveBeenCalled();
    });

    it('should throw error when no fallback is provided', async () => {
      const fn = vi.fn().mockResolvedValue('should not be called');

      await expect(breaker.execute(fn)).rejects.toThrow(
        'Circuit breaker "test-breaker" is OPEN. Service unavailable.',
      );
      expect(fn).not.toHaveBeenCalled();
    });

    it('should transition to HALF_OPEN after timeout', async () => {
      vi.useFakeTimers();
      vi.advanceTimersByTime(1000);

      expect(breaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);
      vi.useRealTimers();
    });
  });

  describe('HALF_OPEN state', () => {
    beforeEach(async () => {
      vi.useFakeTimers();
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow();
      }
      vi.advanceTimersByTime(1000);
      expect(breaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should allow requests through in HALF_OPEN state', async () => {
      const fn = vi.fn().mockResolvedValue('recovered');
      const result = await breaker.execute(fn);

      expect(result).toBe('recovered');
      expect(fn).toHaveBeenCalledOnce();
    });

    it('should transition to CLOSED after reaching success threshold', async () => {
      const fn = vi.fn().mockResolvedValue('ok');

      await breaker.execute(fn);
      await breaker.execute(fn);

      expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should transition back to OPEN on any failure', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('still broken'));

      await expect(breaker.execute(fn)).rejects.toThrow('still broken');
      expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);
    });
  });

  describe('reset', () => {
    it('should reset to CLOSED state with zero counts', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow();
      }
      expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);

      breaker.reset();

      expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(breaker.getFailureCount()).toBe(0);
      expect(breaker.getSuccessCount()).toBe(0);
    });
  });

  describe('default configuration', () => {
    it('should use default values when no config provided', () => {
      const defaultBreaker = new CircuitBreaker();
      expect(defaultBreaker.getName()).toBe('default');
      expect(defaultBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });
  });
});
