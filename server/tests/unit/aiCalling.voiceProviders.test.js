import { describe, it, expect } from '@jest/globals';
import { computeCallCost } from '../../src/modules/aiCalling/engine/callCost.js';
import { providerComparison } from '../../src/modules/aiCalling/engine/providerComparison.js';
import { voiceProviderConfig } from '../../shared/voiceProviderConfig.js';
import * as validation from '../../src/modules/aiCalling/aiCalling.validation.js';

const gemini = { type: 'llm_usage', provider: 'Gemini', model: 'gemini-3.8-live', inputTokens: 10000, inputAudioTokens: 8000, inputTextTokens: 2000,
  outputTokens: 1500, outputAudioTokens: 1000, outputTextTokens: 500, inputCachedTokens: 0 };

describe('multi-provider cost and configuration', () => {
  it('prices the requested Gemini and OpenAI models at separate verified rate cards', () => {
    expect(computeCallCost({ usage: [gemini] }, {}).amount).toBe(0.03975);
    expect(computeCallCost({ usage: [{ ...gemini, provider: 'openai', model: 'gpt-realtime-2.1-mini' }] }, {}).amount).toBe(0.1024);
    expect(computeCallCost({ usage: [{ ...gemini, provider: 'openai' }] }, {}).breakdown.unpriced).toBe(true);
    expect(computeCallCost({ usage: [{ ...gemini, provider: 'Gemini', model: 'gpt-realtime' }] }, {}).breakdown.unpriced).toBe(true);
  });
  it('does not invent Gemini cache prices or count missing modality details as free usage', () => {
    expect(computeCallCost({ usage: [{ ...gemini, inputCachedTokens: 100 }] }, {}).breakdown.unpriced).toBe(true);
    expect(computeCallCost({ usage: [{ ...gemini, inputAudioTokens: 0, inputTextTokens: 0 }] }, {}).breakdown.unpriced).toBe(true);
  });
  it('keeps provider-reported billing separate from calculated estimates and excludes tests', () => {
    const priced = computeCallCost({ usage: [gemini] }, {});
    const call = { aiVoice: { provider: 'gemini', model: gemini.model }, isTest: false, durationSeconds: 60, answeredAt: new Date(),
      at: '2026-10-30T10:00:00Z', leadId: 'lead1', qualification: 'qualified',
      behavior: { answers: { valid: 8, total: 8 }, participation: { leadTurns: 9 } },
      quality: { latency: { samplesMs: [100, 300] } }, cost: { ...priced.breakdown, amount: priced.amount, currency: 'USD' } };
    const comparison = providerComparison([call, { ...call, isTest: true }, { ...call, cost: { ...call.cost, source: 'provider_reported', amount: 0.05 } }]);
    expect(comparison.providers[0]).toMatchObject({ calls: 2, calculatedCostUsd: 0.03975, reportedCostUsd: 0.05, averageLatencyMs: 200, qualificationAccuracy: null, qualifiedLeads: 1 });
    expect(comparison.daily[0]).toMatchObject({ period: '2026-10-30', calls: 2 });
    expect(comparison.monthly[0].period).toBe('2026-10');
    expect(comparison.estimatedSavings).toBeNull(); expect(comparison.invoiceVerified).toBe(false);
  });
  it('protects production from preview models and validates credential/config updates', () => {
    expect(voiceProviderConfig({}, {})).toMatchObject({ primaryProvider: 'gemini', primaryModel: 'gemini-3.8-live', secondaryProvider: 'openai', secondaryModel: 'gpt-realtime-2.1-mini', fallbackEnabled: true });
    expect(validation.providerSettings.body.validate({ primaryModel: 'gemini-3.1-flash-live-preview' }).error).toBeTruthy();
    expect(validation.providerSettings.body.validate({ credentials: { gemini: 'secret-key-example' }, maxSessionSeconds: 600 }).error).toBeUndefined();
    expect(validation.providerSettings.body.validate({ credentials: { unknown: 'secret-key-example' } }).error).toBeTruthy();
  });
});
