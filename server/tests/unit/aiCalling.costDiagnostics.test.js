import { describe, it, expect } from '@jest/globals';
import { computeCallCost } from '../../src/modules/aiCalling/engine/callCost.js';
import { costDiagnostics } from '../../src/modules/aiCalling/engine/costDiagnostics.js';
import { buildSystemPrompt, dynamicLeadInstruction } from '../../src/modules/aiCalling/engine/leadContext.js';

describe('calling cost diagnostics', () => {
  const row = { type: 'llm_usage', model: 'gpt-realtime', provider: 'api.openai.com', inputTokens: 68619, outputTokens: 2048,
    inputAudioTokens: 7190, inputCachedAudioTokens: 2688, inputTextTokens: 61429, inputCachedTextTokens: 33408,
    inputCachedTokens: 36096, outputAudioTokens: 1213, outputTextTokens: 835 };
  it('reproduces the supplied production record and independent modality estimates', () => {
    const cost = computeCallCost({ usage: [row] }, {});
    expect(cost.amount).toBe(0.361578);
    expect(cost.breakdown.components.modelDetail.audioIn).toBe(0.145139);
    expect(cost.breakdown.components.modelDetail.textIn).toBe(0.125447);
    const d = costDiagnostics({ ...cost.breakdown, amount: cost.amount }, { modelUsage: [row] }, 168, {});
    expect(d.cacheHitPercent).toBeCloseTo(52.6035, 3);
    expect(d.estimatedCacheSavings).toBeCloseTo(0.205210, 6);
    expect(d.estimatedCostPerMinute).toBeCloseTo(0.129135, 6);
    expect(d.responseCount).toBeNull(); expect(d.responses).toEqual([]);
  });
  it('prices response detail at historical rates without adding it to aggregate totals', () => {
    const cost = computeCallCost({ usage: [row] }, {});
    const usage = { modelUsage: [row], responseTelemetry: { responseCount: 1, responses: [{ ...row, responseId: 'r1' }] } };
    const d = costDiagnostics({ ...cost.breakdown, amount: cost.amount }, usage, 168, { AI_CALLING_MODEL_PRICING: JSON.stringify({ 'gpt-realtime': { textIn: 999 } }) });
    expect(d.responses[0].estimatedCost).toBe(cost.amount);
    expect(d.responseCount).toBe(1); expect(d.averageOutputTokens).toBe(2048);
  });
  it('does not invent metrics or cache savings for ambiguous usage', () => {
    const usage = { modelUsage: [{ ...row, inputCachedAudioTokens: undefined, inputCachedTextTokens: undefined }] };
    const cost = computeCallCost({ usage }, {});
    const d = costDiagnostics({ ...cost.breakdown, amount: cost.amount }, usage, 168, {});
    expect(d.estimatedCacheSavings).toBeNull(); expect(d.estimatedCostPerMinute).toBeNull();
    expect(d.cachedInputTokens).toBe(36096);
    expect(d.invoiceVerified).toBe(false);
  });
  it('keeps shared instructions identical across leads and excludes unrelated CRM metadata', () => {
    const input = { agentConfig: { language: 'ur', recordCall: true }, questions: [{ fieldKey: 'name', text: 'Your name?' }] };
    const a = buildSystemPrompt({ ...input, lead: { name: 'A', notes: 'secret', email: 'secret@example.com' } });
    const b = buildSystemPrompt({ ...input, lead: { name: 'B' } });
    expect(a).toBe(b); expect(a).not.toContain('secret'); expect(a).toContain('the call is recorded');
    expect(a).toContain('speak Urdu'); expect(a).toContain('latest CRM tool result');
    expect(dynamicLeadInstruction({ name: 'A', notes: 'secret' })).not.toContain('secret');
  });
});
