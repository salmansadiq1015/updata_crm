import logger from '../../shared/logger/index.js';

const DEFAULT_OPTIONS = {
  failureThreshold: 5,
  resetTimeoutMs: 120000,
  halfOpenMaxRequests: 3,
};

class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.halfOpenRequests = 0;
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.options.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
        this.halfOpenRequests = 0;
        logger.info(`Circuit breaker ${this.name} transitioning to HALF_OPEN`, { module: 'integrations', circuitBreaker: this.name });
      } else {
        throw new Error(`Circuit breaker ${this.name} is OPEN — request rejected`);
      }
    }

    if (this.state === 'HALF_OPEN' && this.halfOpenRequests >= this.options.halfOpenMaxRequests) {
      throw new Error(`Circuit breaker ${this.name} HALF_OPEN limit reached`);
    }

    try {
      if (this.state === 'HALF_OPEN') this.halfOpenRequests++;
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (err) {
      this._onFailure();
      throw err;
    }
  }

  _onSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.options.halfOpenMaxRequests) {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.successCount = 0;
        logger.info(`Circuit breaker ${this.name} CLOSED (recovered)`, { module: 'integrations', circuitBreaker: this.name });
      }
    } else {
      this.failureCount = 0;
    }
  }

  _onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.options.failureThreshold) {
      this.state = 'OPEN';
      this.successCount = 0;
      logger.warn(`Circuit breaker ${this.name} OPENED after ${this.failureCount} failures`, { module: 'integrations', circuitBreaker: this.name });
    }
  }

  getState() {
    // Auto-check if OPEN should transition
    if (this.state === 'OPEN' && Date.now() - this.lastFailureTime >= this.options.resetTimeoutMs) {
      return 'HALF_OPEN';
    }
    return this.state;
  }

  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenRequests = 0;
  }
}

// Registry of circuit breakers per integration
const breakers = new Map();

export function getCircuitBreaker(name, options) {
  if (!breakers.has(name)) {
    breakers.set(name, new CircuitBreaker(name, options));
  }
  return breakers.get(name);
}

export default CircuitBreaker;
