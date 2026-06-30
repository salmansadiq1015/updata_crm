import { describe, expect, test } from 'vitest';
import { buildAiRouteContext } from '../ai-route-context';

describe('buildAiRouteContext', () => {
  test('maps field-ops order detail routes to assignment context', () => {
    expect(buildAiRouteContext('/field-ops/orders/64f000000000000000000010')).toMatchObject({
      source: 'route',
      contextModule: 'field-ops',
      recordType: 'assignment',
      recordId: '64f000000000000000000010',
      contextRecordType: 'order',
      contextRecordId: '64f000000000000000000010',
      orderId: '64f000000000000000000010',
    });
  });

  test('maps mobile order subroutes to assignment context', () => {
    expect(buildAiRouteContext('/orders/64f000000000000000000011/report')).toMatchObject({
      contextModule: 'mobile',
      recordType: 'assignment',
      recordId: '64f000000000000000000011',
    });
  });

  test('ignores non-record routes', () => {
    expect(buildAiRouteContext('/orders/create')).toBeNull();
    expect(buildAiRouteContext('/field-ops/orders')).toBeNull();
  });
});
