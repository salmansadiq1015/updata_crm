import { describe, it, expect } from 'vitest';
import { clampRequestDelay, nextThrottleBackoff, effectiveRequestDelay } from '../src/shared/utils';

describe('clampRequestDelay', () => {
  it('keeps an in-range value', () => {
    expect(clampRequestDelay(10_000)).toBe(10_000);
    expect(clampRequestDelay(300_000)).toBe(300_000);
  });

  it('clamps below the 5s floor and above the 5m ceiling', () => {
    expect(clampRequestDelay(1_000)).toBe(5_000);
    expect(clampRequestDelay(999_999)).toBe(300_000);
  });

  it('falls back when the value is missing or not a number', () => {
    expect(clampRequestDelay(undefined)).toBe(10_000);
    expect(clampRequestDelay(null)).toBe(10_000);
    expect(clampRequestDelay(Number.NaN)).toBe(10_000);
  });
});

describe('nextThrottleBackoff', () => {
  it('doubles on throttle up to the ceiling', () => {
    expect(nextThrottleBackoff(1, true)).toBe(2);
    expect(nextThrottleBackoff(2, true)).toBe(4);
    expect(nextThrottleBackoff(4, true, 6)).toBe(6); // capped, not 8
    expect(nextThrottleBackoff(6, true, 6)).toBe(6);
  });

  it('decays by one step on a clean request, never below 1', () => {
    expect(nextThrottleBackoff(4, false)).toBe(3);
    expect(nextThrottleBackoff(1, false)).toBe(1);
  });

  it('normalises a bad current value to 1', () => {
    expect(nextThrottleBackoff(Number.NaN, false)).toBe(1);
    expect(nextThrottleBackoff(0, true)).toBe(2);
  });
});

describe('effectiveRequestDelay', () => {
  it('multiplies the base by the backoff, capped at the max', () => {
    expect(effectiveRequestDelay(10_000, 1)).toBe(10_000);
    expect(effectiveRequestDelay(10_000, 3)).toBe(30_000);
    expect(effectiveRequestDelay(60_000, 6, 300_000)).toBe(300_000); // 360_000 → capped
  });

  it('treats an invalid backoff as 1', () => {
    expect(effectiveRequestDelay(10_000, Number.NaN)).toBe(10_000);
    expect(effectiveRequestDelay(10_000, 0)).toBe(10_000);
  });
});
