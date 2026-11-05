import { z } from 'zod';
import { createHash } from 'node:crypto';
import { EmailAccount, EmailMessage } from './email.models.js';
import CallRecord from '../aiCalling/callRecord.model.js';
import CallCampaign from '../aiCalling/callCampaign.model.js';
import Lead from '../crm/lead.model.js';
import User from '../auth/user.model.js';
import contactPolicy from '../contactPolicy/contactPolicy.service.js';
import { authenticateAgentCall } from '../aiCalling/callAuth.js';
// Namespace import: test doubles of the auth module that only provide authenticate/requirePermission
// must still be able to load every router that pulls this module in.
import * as auth from '../../shared/middleware/authenticate.js';
import { AuthorizationError, ValidationError } from '../../shared/errors/AppError.js';
import { id } from './email.validation.js';
import { assertAgentGrant, saveDraft, submit } from './email.service.js';
async function scope(callId, permission) {
  const call = await CallRecord.findOne({ internalCallId: callId, endedAt: null }).lean();
  if (!call) throw new AuthorizationError('An active call is required');
  const campaign = await CallCampaign.findOne({ _id: call.campaignId, createdBy: call.createdBy }).lean();
  if (!campaign?.agentId) throw new AuthorizationError('This campaign has no assigned email agent');
  const user = await User.findById(call.createdBy).populate('role');
  if (!user || user.status !== 'active' || (user.role?.name !== 'Admin' && !auth.satisfiesPermission(await auth.loadUserPermissions(user), permission))) throw new AuthorizationError('The account owner has not authorized this email action');
  const lead = await Lead.findOne({ _id: call.leadId, createdBy: call.createdBy }).lean();
  if (!lead) throw new AuthorizationError('This lead is outside the mailbox owner scope');
  return { call, campaign, lead, ownerId: call.createdBy, agentId: campaign.agentId };
}
export async function emailContext(callId) {
  const { ownerId, agentId, lead } = await scope(callId, 'email:read');
  const accounts = await EmailAccount.find({ ownerId, status: 'connected', agentGrants: { $elemMatch: { agentId, read: true } } }).lean();
  const messages = await EmailMessage.find({ ownerId, accountId: { $in: accounts.map(a => a._id) }, leadId: lead._id, state: { $in: ['received', 'sent'] } }).sort({ date: -1 }).limit(8).select('subject text from date accountId').lean();
  return { accounts: accounts.map(a => { const g = assertAgentGrant(a, agentId, 'read'); return { id: a._id, address: a.address, instructions: g.instructions, template: g.template, canDraft: g.draft, canSend: g.send, requireApproval: g.requireApproval }; }), messages: messages.map(m => ({ ...m, text: m.text.slice(0, 6000) })) };
}
export async function emailFollowUp(callId, raw) {
  const input = z.object({ accountId: id.optional(), subject: z.string().min(1).max(998).refine(v => !/[\r\n]/.test(v)), text: z.string().min(1).max(20000), scheduledAt: z.iso.datetime().optional() }).strict().parse(raw);
  const { ownerId, agentId, lead } = await scope(callId, 'email:send');
  if (!lead.email) throw new ValidationError('The lead has no CRM email address');
  const blocked = await contactPolicy.hardBlockers(lead, 'email');
  if (blocked.length) throw new AuthorizationError(`Email follow-up blocked: ${blocked.join(', ')}`);
  const account = await EmailAccount.findOne({ ownerId, status: 'connected', ...(input.accountId ? { _id: input.accountId } : {}), agentGrants: { $elemMatch: { agentId, draft: true } } });
  if (!account) throw new AuthorizationError('No email account has granted draft access to this agent');
  const hex = createHash('sha256').update(`${callId}:${account._id}:${input.subject}:${input.text}:${input.scheduledAt || ''}`).digest('hex');
  const key = `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
  const draft = await saveDraft(ownerId, { accountId: String(account._id), to: [lead.email], subject: input.subject, text: `${input.text}${account.signature ? `\n\n${account.signature.replace(/<[^>]+>/g, '')}` : ''}`, idempotencyKey: key, ...(input.scheduledAt ? { scheduledAt: input.scheduledAt } : {}) }, undefined, { agentId });
  await EmailMessage.updateOne({ _id: draft._id, ownerId }, { $set: { leadId: lead._id } });
  const queued = await submit(ownerId, draft._id);
  return { messageId: queued._id, state: queued.state, instruction: queued.state === 'approval' ? 'A human must approve this email. Tell the customer it has been drafted for review, not sent.' : 'Email queued. Do not claim confirmed delivery.' };
}
export function registerEmailAgentTools(router) {
  const run = fn => async (req, res, next) => { try { res.success({ data: await fn(req) }); } catch (e) { next(e instanceof z.ZodError ? new ValidationError('Invalid email follow-up') : e); } };
  router.post('/:callId/email-context', authenticateAgentCall, run(req => emailContext(req.agentCall.callId)));
  router.post('/:callId/email-follow-up', authenticateAgentCall, run(req => emailFollowUp(req.agentCall.callId, req.body)));
}
