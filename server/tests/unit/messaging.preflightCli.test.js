import { describe, expect, test, jest } from '@jest/globals';
import {
  evaluatePreflightResponse, runMessagingPreflight,
} from '../../scripts/messaging-preflight.mjs';

const response = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

describe('messaging deployment preflight CLI', () => {
  test('returns a successful release gate for a ready health response without logging its bearer token', async () => {
    const fetch = jest.fn(async () => response({ data: { operations: { readiness: {
      ready: true, counts: { pass: 8, warn: 1, fail: 0 },
      checks: [{ id: 'pricing', label: 'Pricing', status: 'warn', detail: 'Review configured rates.' }],
    } } } }));
    const output = { log: jest.fn() };
    const report = await runMessagingPreflight({
      apiUrl: 'https://api.example.test', token: 'must-never-be-logged', fetchImpl: fetch, output,
    });

    expect(report).toMatchObject({ ready: true, exitCode: 0 });
    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/messaging/settings/health',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer must-never-be-logged' }) }),
    );
    expect(JSON.stringify(output.log.mock.calls)).not.toContain('must-never-be-logged');
  });

  test('returns a failing release gate and the actionable checks when readiness is blocked', () => {
    expect(evaluatePreflightResponse({ data: { operations: { readiness: {
      ready: false, counts: { pass: 3, warn: 1, fail: 1 },
      checks: [
        { id: 'queue', label: 'Queue', status: 'fail', detail: 'Unavailable.' },
        { id: 'pricing', label: 'Pricing', status: 'warn', detail: 'Review.' },
      ],
    } } } })).toMatchObject({
      ready: false, exitCode: 1,
      actionable: [
        expect.objectContaining({ id: 'queue' }),
        expect.objectContaining({ id: 'pricing' }),
      ],
    });
  });

  test('fails closed for malformed or unauthorized responses', async () => {
    expect(() => evaluatePreflightResponse({ data: {} })).toThrow(/did not contain/i);
    await expect(runMessagingPreflight({
      apiUrl: 'https://api.example.test', token: 'expired',
      fetchImpl: jest.fn(async () => response({ success: false }, 401)), output: { log: jest.fn() },
    })).rejects.toThrow(/HTTP 401/);
  });
});
