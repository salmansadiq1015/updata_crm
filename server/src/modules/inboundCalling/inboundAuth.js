import jwt from 'jsonwebtoken';

/**
 * Call-scoped bearer token for the voice agent worker on an INCOMING call. Same secret as the
 * outbound agent token but a different scope, so an outbound token can never act on an
 * incoming call (or the reverse). It proves "I am the agent for THIS call" and nothing more.
 */
const SCOPE = 'inbound-call-agent';

function secret() {
  const value = process.env.AI_CALLING_AGENT_SECRET || process.env.JWT_SECRET || '';
  if (value) return value;
  if (process.env.NODE_ENV === 'production') throw new Error('AI_CALLING_AGENT_SECRET or JWT_SECRET is required in production');
  return 'dev-insecure-secret';
}

export function issueInboundAgentToken(internalCallId, ttlSeconds = 2400) {
  return jwt.sign({ scope: SCOPE, callId: internalCallId }, secret(), { algorithm: 'HS256', expiresIn: ttlSeconds });
}

export function verifyInboundAgentToken(token) {
  try {
    const payload = jwt.verify(token, secret(), { algorithms: ['HS256'] });
    return payload.scope === SCOPE && payload.callId ? payload : null;
  } catch {
    return null;
  }
}

export function authenticateInboundAgent(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token ? verifyInboundAgentToken(token) : null;
  if (!payload) return res.status(401).json({ success: false, error: { message: 'Invalid or expired agent call token' } });
  if (req.params?.callId && req.params.callId !== payload.callId) {
    return res.status(403).json({ success: false, error: { message: 'Agent token is not valid for this call' } });
  }
  req.agentCall = { callId: payload.callId };
  return next();
}
