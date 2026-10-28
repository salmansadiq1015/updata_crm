import { test } from 'node:test';
import assert from 'node:assert/strict';
import { probeOpenAI, explainRealtimeFailure, crmUnreachable } from '../src/failures.js';

const response = (status, body = {}) => async () => ({ ok: status < 400, status, json: async () => body });
const opts = (fetchImpl) => ({ apiKey: 'sk-test', model: 'gpt-realtime', fetchImpl });

test('probe: a missing key is reported without calling OpenAI', async () => {
  const reason = await probeOpenAI({ apiKey: '', model: 'gpt-realtime', fetchImpl: () => assert.fail('no request') });
  assert.equal(reason.code, 'OPENAI_KEY_MISSING');
});

test('probe: 401 means the key is invalid or expired', async () => {
  const reason = await probeOpenAI(opts(response(401, { error: { code: 'invalid_api_key', message: 'Incorrect API key' } })));
  assert.equal(reason.code, 'OPENAI_KEY_INVALID');
  assert.match(reason.message, /invalid, revoked or expired/);
});

test('probe: 404 names the unavailable model', async () => {
  const reason = await probeOpenAI(opts(response(404, { error: { code: 'model_not_found' } })));
  assert.equal(reason.code, 'OPENAI_MODEL_UNAVAILABLE');
  assert.match(reason.message, /"gpt-realtime"/);
});

test('probe: a working key or an OpenAI outage is not blamed on the key', async () => {
  assert.equal(await probeOpenAI(opts(response(200))), null);
  assert.equal(await probeOpenAI(opts(response(503))), null);
});

test('probe: a network failure says OpenAI is unreachable', async () => {
  const reason = await probeOpenAI(opts(async () => { throw new Error('getaddrinfo ENOTFOUND api.openai.com'); }));
  assert.equal(reason.code, 'OPENAI_UNREACHABLE');
});

test('explain: an OpenAI error code inside the realtime error wins without probing', async () => {
  const error = { type: 'realtime_model_error', recoverable: false, error: { message: 'quota', body: { type: 'insufficient_quota', code: 'insufficient_quota' } } };
  const reason = await explainRealtimeFailure(error, { probe: () => assert.fail('no probe') });
  assert.equal(reason.code, 'OPENAI_NO_CREDIT');
});

test('explain: a bare "connection closed" is resolved by probing the key', async () => {
  const error = { recoverable: false, error: new Error('OpenAI Realtime API connection closed') };
  const reason = await explainRealtimeFailure(error, { probe: async () => ({ code: 'OPENAI_KEY_INVALID', message: 'bad key' }) });
  assert.equal(reason.code, 'OPENAI_KEY_INVALID');
});

test('explain: an inconclusive probe keeps the original error text', async () => {
  const error = { recoverable: false, error: new Error('OpenAI Realtime API connection closed') };
  const reason = await explainRealtimeFailure(error, { probe: async () => null });
  assert.equal(reason.code, 'OPENAI_UNREACHABLE');
  assert.match(reason.message, /connection closed/);
});

test('crmUnreachable names the API base and the shared agent-name cause', () => {
  const reason = crmUnreachable('http://localhost:9097/api/v1/ai-calling/agent', new Error('Unauthorized'));
  assert.equal(reason.code, 'CRM_UNREACHABLE');
  assert.match(reason.message, /localhost:9097.*Unauthorized.*LIVEKIT_AGENT_NAME/s);
});
