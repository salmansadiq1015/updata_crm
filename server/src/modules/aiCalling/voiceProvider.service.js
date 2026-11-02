import AiCallingSettings from './aiCallingSettings.model.js';
import { VOICE_MODELS, voiceProviderConfig } from '../../../shared/voiceProviderConfig.js';
import { sealVoiceCredential, openVoiceCredential } from '../../../shared/voiceCredentials.js';
import { pricingTable } from './engine/callCost.js';
import { ValidationError, ConflictError } from '../../shared/errors/AppError.js';
import auditService from '../auth/audit.service.js';
import CallRecord from './callRecord.model.js';

export async function providerSettings({ worker = false, isTest = false } = {}) {
  const doc = await AiCallingSettings.findOne({ key: 'global' }).select('+providerCredentials').lean();
  const config = voiceProviderConfig(doc?.voiceProviders, process.env, { isTest });
  if (worker) return { ...config, modelPricing: pricingTable(), sealedCredentials: doc?.providerCredentials || {} };
  return {
    ...config, models: VOICE_MODELS, pricing: pricingTable(), pricingSource: 'published_list_prices_or_environment_overrides',
    pricingVerifiedAt: '2026-10-30', currency: 'USD', pricingUnit: 'per_million_tokens',
    credentials: Object.fromEntries(['gemini', 'openai'].map(p => [p, {
      stored: Boolean(doc?.providerCredentials?.[p]),
      // Worker environment credentials can differ; never assert their availability here.
      apiEnvironmentConfigured: Boolean(p === 'gemini' ? process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY : process.env.OPENAI_API_KEY),
    }])),
    health: doc?.providerHealth || {},
  };
}

export async function saveProviderSettings(input, actor, meta = {}) {
  const { credentials, ...settings } = input;
  const doc = await AiCallingSettings.findOne({ key: 'global' }).lean();
  try { voiceProviderConfig({ ...doc?.voiceProviders, ...settings }); } catch (error) { throw new ValidationError(error.message); }
  const set = { updatedBy: actor, providerHealth: {} }; const unset = {};
  for (const [k, value] of Object.entries(settings)) set[`voiceProviders.${k}`] = value;
  for (const [p, value] of Object.entries(credentials || {})) {
    if (value === null) unset[`providerCredentials.${p}`] = '';
    else if (value) {
      try { set[`providerCredentials.${p}`] = sealVoiceCredential(value, p); }
      catch (error) { throw new ValidationError(error.message); }
    }
  }
  await AiCallingSettings.updateOne({ key: 'global' }, { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) }, { upsert: true });
  auditService.logEvent({ eventType: 'ai_calling.providers_updated', userId: actor, ipAddress: meta.ipAddress || 'internal', result: 'success', module: 'ai-calling', details: { fields: Object.keys(settings), credentialProviders: Object.keys(credentials || {}) } });
  return providerSettings();
}

/** Read-only credential/model-access probe. This does NOT prove Live setup/audio. */
export async function testProviderAccess(provider, fetchImpl = fetch) {
  const config = await providerSettings({ worker: true });
  const sealed = config.sealedCredentials[provider];
  let apiKey;
  try { apiKey = sealed ? openVoiceCredential(sealed, provider) : provider === 'gemini' ? process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY : process.env.OPENAI_API_KEY; }
  catch { throw new ValidationError('Stored credential cannot be decrypted; check the API encryption secret'); }
  const model = provider === 'gemini' ? config.primaryModel : config.secondaryModel;
  let result = { provider, model, checkedAt: new Date().toISOString(), scope: 'credential_and_model_access', liveSessionVerified: false, status: 'not_configured' };
  if (apiKey) {
    try {
      const url = provider === 'gemini' ? `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}` : `https://api.openai.com/v1/models/${encodeURIComponent(model)}`;
      const response = await fetchImpl(url, { headers: provider === 'gemini' ? { 'x-goog-api-key': apiKey } : { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(8000) });
      result = { ...result, status: response.ok ? 'accessible' : response.status === 429 ? 'rate_limited' : 'rejected', httpStatus: response.status };
    } catch { result.status = 'unreachable'; }
  }
  await AiCallingSettings.updateOne({ key: 'global' }, { $set: { [`providerHealth.${provider}`]: result } }, { upsert: true });
  return result;
}

export async function recordVoiceProviderAttempt(internalCallId, attempt) {
  const existing = await CallRecord.findOne({ internalCallId }).select('aiVoice').lean();
  if (attempt.status === 'established' && existing?.aiVoice?.provider && existing.aiVoice.provider !== attempt.provider
    && (!attempt.sessionId || existing.aiVoice.sessionId === attempt.sessionId)) {
    throw new ConflictError('An active voice provider cannot be switched during a call');
  }
  const eventId = `${attempt.sessionId || 'call'}:${attempt.provider}:${attempt.status}`;
  const selected = attempt.status === 'established';
  await CallRecord.updateOne({ internalCallId, 'aiVoice.attempts.eventId': { $ne: eventId } }, {
    $push: { 'aiVoice.attempts': { $each: [{ ...attempt, eventId }], $slice: -8 } },
    $set: {
      'aiVoice.policy': 'establishment_only',
      ...(selected ? { 'aiVoice.provider': attempt.provider, 'aiVoice.model': attempt.model, 'aiVoice.fallback': attempt.provider === 'openai', 'aiVoice.sessionId': attempt.sessionId || null } : {}),
    },
  });
  await AiCallingSettings.updateOne({ key: 'global' }, { $set: { [`providerHealth.${attempt.provider}`]: {
    ...attempt, scope: 'worker_live_session', liveSessionVerified: selected,
  } } }, { upsert: true });
  return { recorded: true };
}
