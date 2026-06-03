/**
 * Circuit Breaker implementation for external service calls.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Circuit is tripped, requests fail immediately with fallback
 * - HALF_OPEN: Testing if service has recovered
 *
 * Configuration:
 * - failureThreshold: Number of failures before opening circuit (default: 5)
 * - successThreshold: Number of successes in HALF_OPEN before closing (default: 3)
 * - timeout: Time in ms before transitioning from OPEN to HALF_OPEN (default: 30000)
 */
export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerConfig {
  failureThreshold?: number;
  successThreshold?: number;
  timeout?: number;
  name?: string;
}

const DEFAULT_CONFIG: Required<CircuitBreakerConfig> = {
  failureThreshold: 5,
  successThreshold: 3,
  timeout: 30000,
  name: 'default',
};

export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;
  private readonly config: Required<CircuitBreakerConfig>;

  constructor(config?: CircuitBreakerConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute a function through the circuit breaker.
   * If the circuit is OPEN, the fallback is returned immediately.
   * If the circuit is HALF_OPEN, limited requests are allowed through.
   *
   * @param fn The async function to execute
   * @param fallback Optional fallback value/function when circuit is open or on failure
   */
  async execute<T>(fn: () => Promise<T>, fallback?: T | (() => T)): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitBreakerState.HALF_OPEN;
        this.successCount = 0;
      } else {
        return this.getFallback(fallback);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      if (fallback !== undefined) {
        return this.getFallback(fallback);
      }
      throw error;
    }
  }

  /**
   * Get the current state of the circuit breaker.
   */
  getState(): CircuitBreakerState {
    // Check if we should transition from OPEN to HALF_OPEN
    if (this.state === CircuitBreakerState.OPEN && this.shouldAttemptReset()) {
      this.state = CircuitBreakerState.HALF_OPEN;
      this.successCount = 0;
    }
    return this.state;
  }

  /**
   * Get the name of this circuit breaker instance.
   */
  getName(): string {
    return this.config.name;
  }

  /**
   * Get current failure count.
   */
  getFailureCount(): number {
    return this.failureCount;
  }

  /**
   * Get current success count (relevant in HALF_OPEN state).
   */
  getSuccessCount(): number {
    return this.successCount;
  }

  /**
   * Manually reset the circuit breaker to CLOSED state.
   */
  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
  }

  private onSuccess(): void {
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.state = CircuitBreakerState.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;
        this.lastFailureTime = null;
      }
    } else if (this.state === CircuitBreakerState.CLOSED) {
      // Reset failure count on success in closed state
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      // Any failure in HALF_OPEN immediately opens the circuit
      this.state = CircuitBreakerState.OPEN;
      this.successCount = 0;
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitBreakerState.OPEN;
    }
  }

  private shouldAttemptReset(): boolean {
    if (this.lastFailureTime === null) return false;
    return Date.now() - this.lastFailureTime >= this.config.timeout;
  }

  private getFallback<T>(fallback?: T | (() => T)): T {
    if (fallback === undefined) {
      throw new Error(
        `Circuit breaker "${this.config.name}" is OPEN. Service unavailable.`,
      );
    }
    if (typeof fallback === 'function') {
      return (fallback as () => T)();
    }
    return fallback;
  }
}
