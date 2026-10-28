/**
 * Why a call could not run, in words an operator can act on.
 *
 * The OpenAI Realtime WebSocket hides the HTTP status of a refused handshake (agents-js
 * only reports "connection closed"), so an expired key and a network blip look the same.
 * When the realtime error itself carries no OpenAI error code, a plain REST request with
 * the same key and model tells them apart.
 *
 * The reason reaches the tester through a participant attribute on the agent (the
 * browser reads it before the room closes) and the CRM through /end (failureMessage).
 */
export const AGENT_ERROR_ATTRIBUTE = 'updata.agent_error';

const ENV_FILE = 'server/agent-worker/.env';

const OPENAI_ERROR_CODES = {
  invalid_api_key: 'OPENAI_KEY_INVALID',
  insufficient_quota: 'OPENAI_NO_CREDIT',
  billing_hard_limit_reached: 'OPENAI_NO_CREDIT',
  account_deactivated: 'OPENAI_ACCOUNT_DEACTIVATED',
  model_not_found: 'OPENAI_MODEL_UNAVAILABLE',
};

function messageFor(code, { model, detail } = {}) {
  switch (code) {
    case 'OPENAI_KEY_MISSING':
      return `OPENAI_API_KEY is not set for the voice agent worker. Add it to ${ENV_FILE} and restart the worker.`;
    case 'OPENAI_KEY_INVALID':
      return `OpenAI rejected the voice agent's API key (invalid, revoked or expired). Put a valid key in OPENAI_API_KEY (${ENV_FILE}) and restart the worker.`;
    case 'OPENAI_NO_CREDIT':
      return 'The OpenAI account has no credit left or reached its billing limit. Add credit or raise the limit at platform.openai.com/settings/organization/billing, then try again.';
    case 'OPENAI_ACCOUNT_DEACTIVATED':
      return 'The OpenAI account behind the voice agent\'s API key is deactivated. Use a key from an active account.';
    case 'OPENAI_MODEL_UNAVAILABLE':
      return `The OpenAI model "${model}" is not available to this API key. Set OPENAI_REALTIME_MODEL (${ENV_FILE}) to a realtime model the key can use, e.g. gpt-realtime.`;
    case 'OPENAI_RATE_LIMITED':
      return 'OpenAI is rate-limiting this API key right now. Wait a minute and try again.';
    case 'OPENAI_FORBIDDEN':
      return `OpenAI refused the voice agent's API key${detail ? `: ${detail}` : ''}. Check the key's project permissions.`;
    case 'OPENAI_UNREACHABLE':
      return `The voice agent could not connect to OpenAI${detail ? ` (${detail})` : ''}. Check the worker's internet connection and status.openai.com, then try again.`;
    default:
      return `The voice agent's OpenAI session failed${detail ? `: ${detail}` : ''}. See the agent worker logs.`;
  }
}

export const failure = (code, opts) => ({ code, message: messageFor(code, opts) });

/** The OpenAI error body a realtime error carries, if any (event error, or the inner error of a retry wrapper). */
function openAIErrorBody(error) {
  for (let e = error, depth = 0; e && depth < 4; e = e.error || e.body, depth += 1) {
    const body = e.body && typeof e.body === 'object' ? e.body : e;
    const code = body?.code || body?.type;
    if (typeof code === 'string' && OPENAI_ERROR_CODES[code]) return body;
  }
  return null;
}

/**
 * Ask OpenAI's REST API directly whether this key can use this model. Returns a failure
 * when the answer is conclusive (bad key, model not available…), otherwise null.
 */
export async function probeOpenAI({ apiKey, model, fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  if (!apiKey) return failure('OPENAI_KEY_MISSING');
  let res;
  try {
    res = await fetchImpl(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return failure('OPENAI_UNREACHABLE', { detail: error?.message });
  }
  if (res.ok) return null;
  const body = await res.json().catch(() => ({}));
  const code = OPENAI_ERROR_CODES[body?.error?.code] || OPENAI_ERROR_CODES[body?.error?.type];
  if (code) return failure(code, { model });
  if (res.status === 401) return failure('OPENAI_KEY_INVALID');
  if (res.status === 404) return failure('OPENAI_MODEL_UNAVAILABLE', { model });
  if (res.status === 403) return failure('OPENAI_FORBIDDEN', { detail: body?.error?.message });
  if (res.status === 429) return failure('OPENAI_RATE_LIMITED');
  return null; // 5xx and the like say nothing about the key
}

/** Turn an unrecoverable realtime / session error into an actionable failure. */
export async function explainRealtimeFailure(error, { apiKey, model, probe = probeOpenAI } = {}) {
  const body = openAIErrorBody(error);
  if (body) return failure(OPENAI_ERROR_CODES[body.code] || OPENAI_ERROR_CODES[body.type], { model });
  const probed = await probe({ apiKey, model });
  if (probed) return probed;
  const inner = error?.error || error;
  const detail = String(inner?.message || inner || '').slice(0, 200) || null;
  return failure(/connect|timeout|closed|ENOTFOUND|ECONN/i.test(detail || '') ? 'OPENAI_UNREACHABLE' : 'OPENAI_SESSION_FAILED', { detail });
}

/** The CRM tool API could not give this worker the call. */
export function crmUnreachable(apiBase, error) {
  return {
    code: 'CRM_UNREACHABLE',
    message: `The voice agent could not load this call from the CRM at ${apiBase} (${error?.message || 'error'}). If several environments share this LiveKit project, give each its own LIVEKIT_AGENT_NAME, and make sure the worker can reach the API (PUBLIC_API_BASE_URL).`,
  };
}
