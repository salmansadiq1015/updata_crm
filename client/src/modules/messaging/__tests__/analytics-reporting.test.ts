import { describe, expect, it } from 'vitest';
import {
  analyticsPresetRange, buildAnalyticsParams, formatCostBuckets, isAnalyticsRangeValid,
} from '@/modules/messaging/analytics-reporting';

describe('messaging analytics reporting', () => {
  it('builds inclusive ISO boundaries for an explicit date range', () => {
    const params = buildAnalyticsParams({ from: '2026-09-01', to: '2026-09-30' });
    const from = new Date(params!.from!);
    const to = new Date(params!.to!);
    expect([from.getFullYear(), from.getMonth(), from.getDate(), from.getHours()]).toEqual([2026, 8, 1, 0]);
    expect([to.getFullYear(), to.getMonth(), to.getDate(), to.getHours(), to.getMinutes()]).toEqual([2026, 8, 30, 23, 59]);
    expect(to.getTime()).toBeGreaterThan(from.getTime());
  });

  it('rejects inverted ranges and calculates deterministic presets', () => {
    expect(isAnalyticsRangeValid({ from: '2026-10-02', to: '2026-10-01' })).toBe(false);
    expect(buildAnalyticsParams({ from: '2026-10-02', to: '2026-10-01' })).toBeNull();
    expect(analyticsPresetRange('7d', new Date(2026, 9, 12, 12))).toEqual({ from: '2026-10-06', to: '2026-10-12' });
  });

  it('keeps unlike currencies in separate labeled cost buckets', () => {
    const value = formatCostBuckets([
      { currency: 'USD', actual: 1.2, estimated: 1.5 },
      { currency: 'CHF', actual: 2, estimated: 2.4 },
    ]);
    expect(value).toMatch(/USD|\$/);
    expect(value).toMatch(/CHF/);
    expect(value).toContain('actual');
  });
});
