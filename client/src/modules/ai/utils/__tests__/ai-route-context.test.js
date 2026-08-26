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

  test('maps a task to its own context, not to the list it sits in', () => {
    // A task lives two segments deep; the first segment is the board.
    expect(buildAiRouteContext('/tasks/all/64f000000000000000000012')).toMatchObject({
      contextModule: 'tasks',
      recordType: 'task',
      recordId: '64f000000000000000000012',
      contextRecordType: 'task',
    });
    // The board itself, and the dashboard, are not records.
    expect(buildAiRouteContext('/tasks/all')).toBeNull();
    expect(buildAiRouteContext('/tasks/dashboard')).toBeNull();
  });

  test('an object page carries the object, which the server reads as its customer', () => {
    expect(buildAiRouteContext('/crm/sites/64f000000000000000000013')).toMatchObject({
      contextModule: 'crm',
      recordType: 'site',
      recordId: '64f000000000000000000013',
    });
  });

  test('a list that has opened one row is about that row', () => {
    expect(buildAiRouteContext('/field-ops/reports', new URLSearchParams('reportId=r1'))).toMatchObject({
      recordType: 'report',
      recordId: 'r1',
    });
    expect(buildAiRouteContext('/scheduling/calendar', 'assignmentId=a1')).toMatchObject({
      recordType: 'assignment',
      orderId: 'a1',
    });
  });

  test('the opened row outranks the page it was opened from', () => {
    // Opening a report from a project page: the question is about the report.
    expect(buildAiRouteContext('/projects/p1', 'reportId=r1').recordType).toBe('report');
  });

  test('a query that names no record leaves the route to decide', () => {
    expect(buildAiRouteContext('/projects/p1', 'tab=documents').recordType).toBe('project');
    expect(buildAiRouteContext('/field-ops/reports', 'status=open')).toBeNull();
  });
});
