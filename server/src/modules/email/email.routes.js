import emailWebhooks from './email.webhooks.js';
import { Router } from 'express';
import multer from 'multer';
import { z, ZodError } from 'zod';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { ValidationError, NotFoundError } from '../../shared/errors/AppError.js';
import * as v from './email.validation.js';
import * as service from './email.service.js';
import { startOAuth, finishOAuth } from './email.providers.js';
import { EmailAccount, EmailAttachment } from './email.models.js';
import CallingAgent from '../aiCalling/callingAgent.model.js';
import queue from '../../shared/queue/QueueManager.js';
const router = Router();
router.use('/webhooks', emailWebhooks);
const run = fn => async (req, res, next) => {
  try { const result = await fn(req, res); if (!res.headersSent) res.success({ data: result }); }
  catch (e) { next(e instanceof ZodError ? new ValidationError('Invalid email request', e.issues.map(i => ({ field: i.path.join('.'), message: i.message }))) : e); }
};
const owner = req => req.user._id;
const param = (req, name = 'id') => v.id.parse(req.params[name]);
const oauthProvider = value => z.enum(['google', 'microsoft']).parse(value);
// OAuth redirects cannot carry the CRM bearer token. A single-use, expiring,
// random state binds the authorization response to the authenticated initiator.
router.get('/oauth/:provider/callback', run(async (req, res) => {
  if (req.query.error) { res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/email?connection=denied`); return; }
  const account = await finishOAuth(oauthProvider(req.params.provider), z.string().min(32).max(200).parse(req.query.state), z.string().min(1).max(4096).parse(req.query.code));
  await service.auditEmail(account.ownerId, 'connected', { accountId: account._id, provider: account.provider });
  res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/email?connection=success`);
}));
router.use(authenticate);
router.get('/accounts', requirePermission('email:read'), run(req => service.listAccounts(owner(req))));
router.get('/agents', requirePermission('email:manage'), requirePermission('ai-calling:read'), run(req => CallingAgent.find({ createdBy: owner(req), availability: { $ne: 'archived' } }).select('name availability agentType').lean()));
router.post('/oauth/:provider', requirePermission('email:manage'), run(req => startOAuth(owner(req), oauthProvider(req.params.provider))));
router.post('/accounts/imap', requirePermission('email:manage'), run(req => service.connectImap(owner(req), v.connection.parse(req.body))));
router.patch('/accounts/:id', requirePermission('email:manage'), (req, res, next) => req.body?.autoIntelligence ? requirePermission('email:ai')(req, res, next) : next(), (req, res, next) => req.body?.followUp?.enabled ? requirePermission('email:send')(req, res, next) : next(), run(req => service.settings(owner(req), param(req), v.accountSettings.parse(req.body))));
router.delete('/accounts/:id', requirePermission('email:manage'), run(req => service.disconnect(owner(req), param(req))));
router.post('/accounts/:id/sync', requirePermission('email:write'), run(async req => {
  const a = await service.accountFor(owner(req), param(req));
  if (a.status !== 'connected') throw new ValidationError('Reconnect this account first');
  await EmailAccount.updateOne({ _id: a._id }, { $set: { nextSyncAt: new Date() } });
  await queue.addJob('mailbox', 'sync', { accountId: String(a._id) }, { jobId: `email-sync-${a._id}`, attempts: 3, backoff: { type: 'exponential', delay: 30000 }, removeOnComplete: true, removeOnFail: true });
  return { queued: true };
}));
router.get('/messages', requirePermission('email:read'), run(req => service.listMessages(owner(req), req.query)));
router.get('/messages/:id', requirePermission('email:read'), run(req => service.conversation(owner(req), param(req))));
router.get('/drafts/:id', requirePermission('email:write'), run(async req => (await service.messageFor(owner(req), param(req), true)).populate('attachments', 'name mime size')));
router.post('/messages/bulk', requirePermission('email:write'), run(req => service.bulk(owner(req), v.mutation.parse(req.body))));
router.post('/drafts', requirePermission('email:write'), run(req => service.saveDraft(owner(req), req.body)));
router.put('/drafts/:id', requirePermission('email:write'), run(req => service.saveDraft(owner(req), req.body, param(req))));
router.post('/messages/:id/send', requirePermission('email:send'), run(req => service.submit(owner(req), param(req))));
router.post('/messages/:id/approve', requirePermission('email:send'), run(req => service.submit(owner(req), param(req), true)));
router.post('/messages/:id/cancel', requirePermission('email:write'), run(req => service.cancel(owner(req), param(req))));
router.post('/messages/:id/ai', requirePermission('email:ai'), run(req => service.intelligence(owner(req), param(req), z.object({ action: z.enum(['insights', 'reply', 'rewrite']).default('insights'), instructions: z.string().max(4000).default('') }).strict().parse(req.body))));
router.post('/messages/:id/link', requirePermission('email:write'), requirePermission('crm:write'), run(req => service.linkCrm(owner(req), param(req), z.object({ leadId: v.id.optional(), contactId: v.id.optional() }).strict().refine(x => Boolean(x.leadId) !== Boolean(x.contactId), 'Choose a lead or customer').parse(req.body))));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 0 } });
router.post('/accounts/:id/attachments', requirePermission('email:write'), upload.single('file'), run(req => { if (!req.file) throw new ValidationError('Select a file'); return service.upload(owner(req), param(req), req.file); }));
router.get('/attachments/:id', requirePermission('email:read'), run(async (req, res) => {
  const f = await EmailAttachment.findOne({ _id: param(req), ownerId: owner(req) }).select('+content');
  if (!f) throw new NotFoundError('Email attachment');
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cache-Control', 'private, no-store');
  await service.auditEmail(owner(req), 'attachment_downloaded', { attachmentId: f._id });
  res.send(f.content);
}));
// Interactive agent actions require an authenticated owner; a client-supplied
// agent identifier alone never grants mailbox access.
router.get('/agents/:agentId/accounts', requirePermission('email:read'), requirePermission('ai-calling:read'), run(async req => {
  const agentId = param(req, 'agentId');
  return EmailAccount.find({ ownerId: owner(req), status: 'connected', agentGrants: { $elemMatch: { agentId, read: true } } }).select('address name provider').lean();
}));
router.post('/agents/:agentId/drafts', requirePermission('email:write'), requirePermission('ai-calling:write'), run(req => service.saveDraft(owner(req), req.body, undefined, { agentId: param(req, 'agentId') })));
router.post('/agents/:agentId/messages/:id/ai', requirePermission('email:ai'), requirePermission('ai-calling:write'), run(req => service.intelligence(owner(req), param(req), { ...z.object({ action: z.enum(['insights', 'reply']).default('reply'), instructions: z.string().max(4000).default('') }).strict().parse(req.body), agentId: param(req, 'agentId') })));
export default router;
