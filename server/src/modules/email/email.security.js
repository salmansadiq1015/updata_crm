import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP, BlockList } from 'node:net';
import { ValidationError, ServiceUnavailableError } from '../../shared/errors/AppError.js';
function key() {
  if (!/^[a-f0-9]{64}$/i.test(process.env.EMAIL_CREDENTIAL_SECRET || '')) throw new ServiceUnavailableError('EMAIL_CREDENTIAL_SECRET must contain 32 random bytes as 64 hex characters');
  return Buffer.from(process.env.EMAIL_CREDENTIAL_SECRET, 'hex');
}
export const digest = value => createHash('sha256').update(value).digest('hex');
export function seal(value, context) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(`updata-email-v1:${context}`));
  const body = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
}
export function open(blob, context) {
  const [version, iv, tag, body] = String(blob).split('.');
  if (version !== 'v1') throw new ValidationError('Invalid email credential version');
  const cipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  cipher.setAAD(Buffer.from(`updata-email-v1:${context}`)); cipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return JSON.parse(Buffer.concat([cipher.update(Buffer.from(body, 'base64url')), cipher.final()]).toString());
}
// Deployment administrators explicitly allow custom mail servers. Resolved IPs are
// pinned into the connection, avoiding DNS rebinding between validation and connect.
const blocked = new BlockList();
for (const [ip, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16], ['100.64.0.0', 10], ['224.0.0.0', 4], ['240.0.0.0', 4]]) blocked.addSubnet(ip, prefix, 'ipv4');
export async function mailHost(host) {
  const allowed = (process.env.EMAIL_ALLOWED_MAIL_HOSTS || '').toLowerCase().split(',').map(x => x.trim());
  if (!host || isIP(host) || !allowed.includes(host.toLowerCase())) throw new ValidationError('Mail host must be listed in EMAIL_ALLOWED_MAIL_HOSTS');
  const ips = await lookup(host, { all: true, family: 4 });
  if (!ips.length || ips.some(x => blocked.check(x.address, 'ipv4'))) throw new ValidationError('Mail servers must resolve to public addresses');
  return { host: ips[0].address, servername: host };
}
export const publicAccount = a => {
  const { credentials: _credentials, webhookSecret: _webhook, cursor: _cursor, syncLease: _lease, syncLeaseToken: _leaseToken, credentialLease: _refresh, ...safe } = a.toObject ? a.toObject() : a;
  return safe;
};
