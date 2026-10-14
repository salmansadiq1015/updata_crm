import crypto from 'node:crypto';

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

function secret() {
  return process.env.MESSAGE_UNSUBSCRIBE_SECRET || process.env.MESSAGE_DESTINATION_HASH_SECRET || process.env.JWT_SECRET || '';
}

export function createUnsubscribeToken(payload, ttlDays = 365) {
  if (!secret()) throw new Error('Email unsubscribe signing secret is not configured');
  const body = encode({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlDays * 86400 });
  const signature = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export function verifyUnsubscribeToken(token) {
  const [body, signature] = String(token || '').split('.');
  if (!body || !signature || !secret()) return null;
  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    if (!payload.leadId || !payload.destinationHash) return null;
    return payload;
  } catch { return null; }
}
