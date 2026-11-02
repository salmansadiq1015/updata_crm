import { test } from 'node:test';
import assert from 'node:assert/strict';
import { establishProvider } from '../src/providers/providerManager.js';
import { voiceProviderConfig } from '../../shared/voiceProviderConfig.js';
import { sealVoiceCredential, openVoiceCredential } from '../../shared/voiceCredentials.js';
import { billingUsage } from '../src/billingUsage.js';
import { createResponseUsage } from '../src/responseUsage.js';

const config = voiceProviderConfig({}, {});
const adapter = (calls, name, error) => ({
  async initializeSession() { calls.push(`${name}:initialize`); },
  async connect() { calls.push(`${name}:connect`); if (error) throw Object.assign(new Error(error), { code: error }); },
  async terminateSession() { calls.push(`${name}:close`); },
});

test('default priority and model IDs; OpenAI is never contacted when Gemini establishes', async () => {
  const calls = [];
  const result = await establishProvider({ config, createAdapter: ({ provider }) => adapter(calls, provider) });
  assert.equal(result.provider, 'gemini'); assert.equal(result.model, 'gemini-3.8-live');
  assert.equal(result.fallback, false); assert.deepEqual(calls, ['gemini:initialize', 'gemini:connect']);
  assert.equal(config.secondaryModel, 'gpt-realtime-2.1-mini');
  assert.equal(voiceProviderConfig({}, { OPENAI_REALTIME_MODEL: 'gpt-realtime' }).secondaryModel, 'gpt-realtime-2.1-mini');
  assert.equal(voiceProviderConfig({}, { SECONDARY_MODEL: 'gpt-realtime' }).secondaryModel, 'gpt-realtime');
});

for (const reason of ['CREDENTIAL_UNAVAILABLE', 'MODEL_UNAVAILABLE', 'CONNECTION_TIMEOUT', 'AUTHENTICATION_FAILED', 'RATE_LIMIT_OR_QUOTA']) {
  test(`Gemini ${reason}: closes before OpenAI and records why`, async () => {
    const calls = []; const events = [];
    const result = await establishProvider({ config, createAdapter: ({ provider }) => adapter(calls, provider, provider === 'gemini' ? reason : null), onAttempt: async e => events.push(e) });
    assert.deepEqual(calls, ['gemini:initialize', 'gemini:connect', 'gemini:close', 'openai:initialize', 'openai:connect']);
    assert.equal(result.model, 'gpt-realtime-2.1-mini'); assert.equal(result.fallback, true);
    assert.equal(events[0].reason, reason); assert.equal(events[1].status, 'established');
  });
}

test('disabled fallback does not contact OpenAI; both unavailable close all attempts', async () => {
  for (const fallbackEnabled of [false, true]) {
    const calls = [];
    await assert.rejects(establishProvider({ config: { ...config, fallbackEnabled }, createAdapter: ({ provider }) => adapter(calls, provider, 'RATE_LIMIT_OR_QUOTA') }), error => error.code === 'VOICE_PROVIDERS_UNAVAILABLE' && error.attempts.length === (fallbackEnabled ? 2 : 1));
    assert.equal(calls.filter(x => x.endsWith(':close')).length, fallbackEnabled ? 2 : 1);
  }
});

test('failure to close or persist selection cannot start another provider', async () => {
  const calls = [];
  await assert.rejects(establishProvider({ config, createAdapter: ({ provider }) => adapter(calls, provider), onAttempt: async () => { throw new Error('CRM offline'); } }), /persist provider/);
  assert.deepEqual(calls, ['gemini:initialize', 'gemini:connect', 'gemini:close']);
  const faulty = adapter([], 'gemini', 'CONNECTION_TIMEOUT'); faulty.terminateSession = async () => { throw new Error('Cannot close'); };
  await assert.rejects(establishProvider({ config, createAdapter: () => faulty }), /Cannot close/);
});

test('production cannot select previews; tests may select explicitly configured preview', () => {
  assert.equal(voiceProviderConfig({ experimentalModel: 'gemini-3.1-flash-live-preview' }, {}, { isTest: true }).selectedGeminiModel, 'gemini-3.1-flash-live-preview');
  assert.equal(voiceProviderConfig({ experimentalModel: 'gemini-3.1-flash-live-preview' }, {}).selectedGeminiModel, 'gemini-3.8-live');
  assert.throws(() => voiceProviderConfig({ primaryModel: 'gemini-3.1-flash-live-preview' }, {}), /stable registry/);
  assert.throws(() => voiceProviderConfig({ secondaryModel: 'gpt-4o' }, {}), /Realtime model/);
});

test('credential encryption is authenticated, randomized and bound to provider', () => {
  const env = { AI_CALLING_CREDENTIAL_SECRET: 'a'.repeat(64) };
  const sealed = sealVoiceCredential('permanent-secret-key', 'gemini', env);
  assert.ok(!sealed.includes('permanent-secret-key'));
  assert.notEqual(sealed, sealVoiceCredential('permanent-secret-key', 'gemini', env));
  assert.equal(openVoiceCredential(sealed, 'gemini', env), 'permanent-secret-key');
  assert.throws(() => openVoiceCredential(sealed, 'openai', env));
  assert.throws(() => openVoiceCredential(sealed, 'gemini', { AI_CALLING_CREDENTIAL_SECRET: 'b'.repeat(64) }));
  assert.throws(() => sealVoiceCredential('secret', 'gemini', {}), /32 random bytes/);
});

test('Gemini cumulative snapshots and per-response usage keep separate provider identities', () => {
  const usage = billingUsage({ modelUsage: [{ type: 'llm_usage', model: '', provider: '', inputTokens: 300 }] }, { model: 'gemini-3.8-live', provider: 'gemini' });
  assert.equal(usage.modelUsage[0].provider, 'gemini');
  const responses = createResponseUsage({ model: 'gemini-3.8-live', provider: 'gemini' });
  assert.equal(responses.observe({ type: 'realtime_model_metrics', requestId: 'r1', inputTokens: 300, outputTokens: 20 }), true);
  assert.equal(responses.observe({ type: 'realtime_model_metrics', requestId: 'r1', inputTokens: 300, outputTokens: 20 }), false);
  assert.equal(responses.snapshot().responses[0].provider, 'gemini');
  assert.equal(usage.modelUsage[0].inputTokens, 300);
});
