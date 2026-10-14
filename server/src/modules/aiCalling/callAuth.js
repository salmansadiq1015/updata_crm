import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

/**
 * Short-lived, call-scoped bearer tokens for the voice agent worker.
 *
 * The LiveKit Agents worker is a separate process; during a live call it talks to
 * the CRM's agent tool API. Instead of giving it a user session, each call issues
 * a token scoped to exactly one internalCallId. The token proves "I am the agent
 * for THIS call" and nothing more — it cannot create campaigns, read other leads,
 * or change lead status directly; it can only invoke the constrained call tools.
 */
function configuredSecret(primaryName) {
  const value = process.env[primaryName] || process.env.JWT_SECRET || '';
  if (value) return value;
  if (process.env.NODE_ENV === 'production') throw new Error(`${primaryName} or JWT_SECRET is required in production`);
  return 'dev-insecure-secret';
}
const SECRET = () => configuredSecret('AI_CALLING_AGENT_SECRET');
const PHONE_SECRET = () => configuredSecret('AI_CALLING_PHONE_HASH_SECRET');

export function issueAgentToken(internalCallId, ttlSeconds = 1800) {
  return jwt.sign({ scope: 'ai-call-agent', callId: internalCallId }, SECRET(), {
    algorithm: 'HS256',
    expiresIn: ttlSeconds,
  });
}

export function verifyAgentToken(token) {
  try {
    const payload = jwt.verify(token, SECRET(), { algorithms: ['HS256'] });
    if (payload.scope !== 'ai-call-agent' || !payload.callId) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Stable, non-reversible phone hash used for suppression lookups. */
export function phoneHash(e164) {
  return crypto.createHmac('sha256', PHONE_SECRET())
    .update(`voice:${String(e164 || '').trim()}`)
    .digest('hex');
}

/**
 * Express middleware: authenticate a request from the voice agent worker and
 * attach req.agentCall = { callId }.
 */
export function authenticateAgentCall(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.body?.agentToken || req.query?.agentToken);
  const payload = verifyAgentToken(token);
  if (!payload) return res.status(401).json({ success: false, error: { message: 'Invalid or expired agent call token' } });
  req.agentCall = { callId: payload.callId };
  return next();
}
