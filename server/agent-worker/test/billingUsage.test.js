import { test } from 'node:test';
import assert from 'node:assert/strict';
import { billingUsage } from '../src/billingUsage.js';

test('records the actual worker model when SDK Realtime metadata is empty', () => {
  const input = { modelUsage: [{ type: 'llm_usage', model: '', provider: '', inputTokens: 101210, outputTokens: 2657 }] };
  const result = billingUsage(input, { model: 'gpt-realtime-mini' });
  assert.deepEqual(result.modelUsage[0], { ...input.modelUsage[0], model: 'gpt-realtime-mini', provider: 'api.openai.com', modelSource: 'worker_configuration' });
  assert.equal(input.modelUsage[0].model, '', 'raw SDK snapshot remains unchanged');
});

test('preserves explicit model/provider evidence and separate transcription usage', () => {
  const input = { modelUsage: [
    { type: 'llm_usage', model: 'gpt-realtime-2025-08-28', provider: 'openai', inputTokens: 12000 },
    { type: 'stt_usage', model: 'gpt-transcribe', audioDuration: 5 },
  ] };
  const result = billingUsage(input, { model: 'gpt-realtime-mini' });
  assert.equal(result.modelUsage[0].model, 'gpt-realtime-2025-08-28');
  assert.equal(result.modelUsage[0].modelSource, 'provider_metrics');
  assert.deepEqual(result.modelUsage[1], input.modelUsage[1]);
});

test('takes the final snapshot once instead of adding cumulative reports', () => {
  const previous = billingUsage({ modelUsage: [{ type: 'llm_usage', inputTokens: 500 }] }, { model: 'gpt-realtime' });
  const final = billingUsage({ modelUsage: [{ type: 'llm_usage', inputTokens: 1000 }] }, { model: 'gpt-realtime' });
  assert.equal(previous.modelUsage[0].inputTokens, 500);
  assert.equal(final.modelUsage[0].inputTokens, 1000);
  assert.equal(billingUsage(null, { model: 'gpt-realtime' }), null);
});
