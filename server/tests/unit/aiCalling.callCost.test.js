import { describe, expect, it } from '@jest/globals';
import { computeCallCost, pricingTable, resolvePricing, summarizeUsage } from '../../src/modules/aiCalling/engine/callCost.js';

const realtime = { type: 'llm_usage', provider: 'openai', model: 'gpt-realtime', inputTokens: 12000, inputAudioTokens: 10000, inputCachedAudioTokens: 4000, inputTextTokens: 2000, inputCachedTokens: 4000, outputTokens: 3000, outputAudioTokens: 2500, outputTextTokens: 500 };

describe('call-cost accounting safeguards', () => {
  it('prices mixed models separately rather than applying the most expensive model to all tokens', () => {
    const mini = { ...realtime, model: 'gpt-realtime-mini' };
    const result = computeCallCost({ usage: { modelUsage: [realtime, mini] } }, {});
    // Realtime $0.3696 + mini $0.1136, including each model's cache discount.
    expect(result.amount).toBeCloseTo(0.4832, 6);
    expect(result.breakdown.models.map(m => m.amount)).toEqual([0.3696, 0.1136]);
    expect(result.breakdown.invoiceVerified).toBe(false);
    expect(result.breakdown.pricingVersion).toBe(2);
  });

  it('preserves unspecified prices in a partial override and accepts explicit zero', () => {
    const table = pricingTable({ AI_CALLING_MODEL_PRICING: '{"gpt-realtime":{"audioOut":0,"textIn":-1}}' });
    expect(table['gpt-realtime']).toMatchObject({ audioOut: 0, audioIn: 32, audioCachedIn: 0.4, textIn: 4, textOut: 16 });
  });

  it('recognizes dated snapshots but does not price a different model family at a guessed rate', () => {
    expect(resolvePricing('gpt-realtime-2025-08-28').pricedAs).toBe('gpt-realtime');
    expect(resolvePricing('gpt-realtime-mini-2025-10-06').pricedAs).toBe('gpt-realtime-mini');
    expect(resolvePricing('gpt-realtime-2')).toBeNull();
    expect(resolvePricing('gpt-realtime-mini-custom')).toBeNull();
  });

  it('does not apply OpenAI rates to another provider with the same model name', () => {
    const result = computeCallCost({ usage: { modelUsage: [{ ...realtime, provider: 'different-provider' }] } }, {});
    expect(result).toMatchObject({ amount: 0, breakdown: { unpriced: true } });
    expect(result.breakdown.models[0].issues).toContain('unknown_model_or_provider');
  });

  it('does not charge cached tokens again as uncached input or count them again in total tokens', () => {
    const result = computeCallCost({ usage: { modelUsage: [{ ...realtime, inputCachedAudioTokens: 10000, inputCachedTextTokens: 2000, inputCachedTokens: 12000 }] } }, {});
    expect(result.amount).toBeCloseTo(0.1728, 6);
    expect(result.breakdown.tokens.total).toBe(15000);
  });

  it('marks ambiguous cached audio/text splits as incomplete instead of overcharging them', () => {
    const { inputCachedAudioTokens: _ignored, ...legacy } = realtime;
    const result = computeCallCost({ usage: { modelUsage: [legacy] } }, {});
    expect(result).toMatchObject({ amount: 0, breakdown: { unpriced: true } });
    expect(result.breakdown.models[0].issues).toContain('missing_cached_modality_split');
  });

  it('can infer cached input when there is only one input modality', () => {
    const result = summarizeUsage([{ model: 'gpt-realtime', inputTokens: 1000, inputAudioTokens: 1000, inputCachedTokens: 750 }]);
    expect(result.tokens).toMatchObject({ inputCachedAudio: 750, inputText: 0 });
  });

  it('rejects cached modality counts that disagree with the reported cached total', () => {
    const result = computeCallCost({ usage: { modelUsage: [{ ...realtime, inputCachedTextTokens: 2000 }] } }, {});
    expect(result).toMatchObject({ amount: 0, breakdown: { unpriced: true } });
    expect(result.breakdown.models[0].issues).toContain('inconsistent_token_totals');
  });

  it.each([Infinity, -1, 'invalid'])('does not price invalid input token counts: %s', inputTokens => {
    const result = computeCallCost({ usage: { modelUsage: [{ ...realtime, inputTokens }] } }, {});
    expect(result).toMatchObject({ amount: 0, breakdown: { unpriced: true } });
  });

  it('preserves explicit zero detail counts rather than filling them with another modality', () => {
    expect(summarizeUsage([{ inputTokens: 500, inputTextTokens: 0, outputTokens: 300, outputTextTokens: 0 }]).tokens).toMatchObject({ inputText: 0, outputText: 0 });
  });

  it('does not fold separately billed transcription into Realtime token counts', () => {
    const result = computeCallCost({ usage: { modelUsage: [realtime, { type: 'stt_usage', model: 'gpt-transcribe', audioDuration: 20 }] } }, {});
    expect(result.amount).toBe(0.3696);
    expect(result.breakdown.tokens.total).toBe(15000);
  });
});
