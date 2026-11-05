import { Router } from 'express';
import { createPublicKey, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { EmailAccount } from './email.models.js';
import { digest } from './email.security.js';
import { request } from './email.providers.js';
import queue from '../../shared/queue/QueueManager.js';
const router = Router();
let googleKeys = null, keysUntil = 0;
async function schedule(account) {
  await EmailAccount.updateOne({ _id: account._id, status: 'connected' }, { $set: { nextSyncAt: new Date() } });
  await queue.addJob('mailbox', 'sync', { accountId: String(account._id) }, { jobId: `email-sync-${account._id}`, attempts: 3, backoff: { type: 'exponential', delay: 30000 }, removeOnComplete: true, removeOnFail: true });
}
router.post('/google', async (req, res, next) => {
  try {
    if (!process.env.EMAIL_GOOGLE_PUSH_AUDIENCE || !process.env.EMAIL_GOOGLE_PUSH_SERVICE_ACCOUNT) return res.sendStatus(503);
    const token = (req.get('authorization') || '').replace(/^Bearer /, ''), decoded = jwt.decode(token, { complete: true });
    if (!decoded || decoded.header.alg !== 'RS256') return res.sendStatus(401);
    if (!googleKeys || Date.now() > keysUntil || !googleKeys.some(k => k.kid === decoded.header.kid)) {
      googleKeys = (await request('https://www.googleapis.com/oauth2/v3/certs')).keys; keysUntil = Date.now() + 3600000;
    }
    const key = googleKeys.find(k => k.kid === decoded.header.kid);
    if (!key) return res.sendStatus(401);
    let identity;
    try { identity = jwt.verify(token, createPublicKey({ key, format: 'jwk' }), { algorithms: ['RS256'], issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: process.env.EMAIL_GOOGLE_PUSH_AUDIENCE }); }
    catch { return res.sendStatus(401); }
    if (identity.email !== process.env.EMAIL_GOOGLE_PUSH_SERVICE_ACCOUNT || identity.email_verified !== true) return res.sendStatus(401);
    let data;
    try { data = JSON.parse(Buffer.from(String(req.body?.message?.data || ''), 'base64').toString()); } catch { return res.sendStatus(400); }
    if (typeof data.emailAddress !== 'string') return res.sendStatus(400);
    const accounts = await EmailAccount.find({ provider: 'google', address: data.emailAddress.toLowerCase(), status: 'connected' }).select('_id').limit(100);
    for (const a of accounts) await schedule(a);
    return res.sendStatus(204);
  } catch (e) { next(e); }
});
router.post('/microsoft', async (req, res, next) => {
  try {
    if (typeof req.query.validationToken === 'string') return res.type('text/plain').send(req.query.validationToken.slice(0, 2048));
    if (!Array.isArray(req.body?.value) || req.body.value.length > 100) return res.sendStatus(400);
    for (const item of req.body.value) {
      if (typeof item.subscriptionId !== 'string' || typeof item.clientState !== 'string') return res.sendStatus(401);
      const account = await EmailAccount.findOne({ subscriptionId: item.subscriptionId, provider: 'microsoft', status: 'connected' }).select('+webhookSecret');
      const received = Buffer.from(digest(item.clientState)), expected = Buffer.from(account?.webhookSecret || '');
      if (!account || received.length !== expected.length || !timingSafeEqual(received, expected)) return res.sendStatus(401);
      await schedule(account);
    }
    return res.sendStatus(202);
  } catch (e) { next(e); }
});
export default router;
