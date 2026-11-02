import { it, expect } from 'vitest';
import { compareCallCosts } from '../cost-comparison';
import type { AnalyzedCall } from '../types/ai-calling-types';

const before = { id: 'a', leadId: 'l', provider: 'paired_phone', isTest: false, durationSeconds: 120, disposition: 'answered_completed',
  behavior: { answers: { valid: 8, total: 8 } }, cost: { amount: 0.4, model: 'gpt-realtime', currency: 'USD', source: 'token_usage', unpriced: false, rates: { textIn: 4 } },
  costDiagnostics: { configuration: { questionnaireFingerprint: 'questions', voice: 'alloy' } } } as unknown as AnalyzedCall;
const after = { ...before, id: 'b', durationSeconds: 60, cost: { ...before.cost, amount: 0.1 } };

it('compares recorded costs per minute and uses only explicit monthly volume', () => {
  expect(compareCallCosts(before, after)).toEqual({ previous: 0.2, current: 0.1, reduction: 0.1, percent: 50, monthly: null });
  expect(compareCallCosts(before, after, 200)?.monthly).toBe(20);
});
it('refuses missing provenance, different models and incomplete qualification', () => {
  expect(compareCallCosts(before, { ...after, costDiagnostics: undefined })).toBeNull();
  expect(compareCallCosts(before, { ...after, cost: { ...after.cost, model: 'gpt-realtime-mini' } })).toBeNull();
  expect(compareCallCosts(before, { ...after, disposition: 'answered_partial' })).toBeNull();
  expect(compareCallCosts(before, { ...after, cost: { ...after.cost, rates: { textIn: 8 } } })).toBeNull();
});
