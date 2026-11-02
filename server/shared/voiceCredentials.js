import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function key(env) {
  const secret = env.AI_CALLING_CREDENTIAL_SECRET || '';
  if (!/^[a-f0-9]{64}$/i.test(secret)) throw new Error('AI_CALLING_CREDENTIAL_SECRET must be 32 random bytes encoded as 64 hex characters on the API and worker');
  return Buffer.from(secret, 'hex');
}

export function sealVoiceCredential(value, provider, env = process.env) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(env), iv);
  cipher.setAAD(Buffer.from(`updata-voice-v1:${provider}`));
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

export function openVoiceCredential(blob, provider, env = process.env) {
  const [version, iv, tag, data] = String(blob).split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Invalid encrypted voice credential');
  const cipher = createDecipheriv('aes-256-gcm', key(env), Buffer.from(iv, 'base64url'));
  cipher.setAAD(Buffer.from(`updata-voice-v1:${provider}`));
  cipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([cipher.update(Buffer.from(data, 'base64url')), cipher.final()]).toString('utf8');
}
