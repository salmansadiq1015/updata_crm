/**
 * Node handlers. Every side-effect goes through the EXISTING module that owns it:
 *   ai.call      → aiCalling.createCampaign/startCampaign (single-lead, kind 'workflow', launchKey)
 *   ai.callback  → leadFollowUp.upsertFromSource (+ followUpCalling.assignAgent for AI callbacks)
 *   msg.*        → messaging.createCampaign/startCampaign (single-lead, idempotencyKey)
 *   notify.user  → notification.service.create (idempotencyKey)
 *   task.create  → task.service.create
 *   crm.*        → lead.service.update / leadQualification.mergeAnswers / LeadEvent timeline
 *
 * Handler contract:
 *   execute(ctx) / resume(ctx) → one of
 *     { status: 'completed', port, output?, context? }
 *     { status: 'waiting', wait: { kind, until, events?, data? }, pollAt? }
 *     { status: 'retry', at: Date, reason }           (re-run this step later, same actionKey)
 *     { status: 'failed', error: { code, message } }  (follows the 'error'-less failure policy)
 *
 * Idempotency: ctx.keyHash is derived from the step's actionKey (run:node:visit), so a
 * replay after a crash hands the same key to the downstream service.
 */
import { collectFields, evaluateCondition } from './conditions.js';
import { loadLead, renderText, resolveFields } from './context.js';
import { computeDelayUntil } from './time.js';
import { END_OUTCOME_LEAD_STATUS, NODE_CATALOG, REACHED_DISPOSITIONS } from '../workflow.constants.js';

const MIN = 60_000;
const HOUR = 3_600_000;
const str = (v) => (v == null ? null : String(v));
const completed = (port, output = null, context = null) => ({ status: 'completed', port, output, context });
const failed = (code, message) => ({ status: 'failed', error: { code, message: String(message || code).slice(0, 500) } });
const retry = (ms, reason) => ({ status: 'retry', at: new Date(Date.now() + ms), reason });
const isInfraError = (e) => e?.statusCode === 503 || /offline|unavailable|queue|ECONN|timed out/i.test(e?.message || '');

async function leadOf(ctx) {
  if (ctx._lead === undefined) ctx._lead = await loadLead(ctx.run.leadId);
  return ctx._lead;
}

async function recordLeadAction(ctx, type, details) {
  if (ctx.dry) return;
  const { recordLeadEvent } = await import('../../crm/leadEvent.model.js');
  await recordLeadEvent({
    leadId: ctx.run.leadId, type, actor: null,
    details: { workflowId: str(ctx.run.workflowId), workflowName: ctx.workflow?.name || '', runId: str(ctx.run._id), nodeId: ctx.node.id, ...details },
    dedupeKey: `wf:${ctx.keyHash}:${type}`,
  });
}

/** Hard blocks end the branch ('blocked'); soft limits (frequency, quiet hours) wait. */
async function contactGate(ctx, channel) {
  const { checkContactSuppression } = await import('../../crm/leadContactSuppression.js');
  const r = await checkContactSuppression(ctx.run.leadId, channel);
  if (!r?.suppressed) return null;
  if (r.limited && r.nextAllowedAt) {
    const at = new Date(r.nextAllowedAt);
    return { status: 'retry', at: at > new Date() ? at : new Date(Date.now() + 15 * MIN), reason: `contact_limited:${r.reason}` };
  }
  return completed('blocked', { blocked: true, reason: r.reason || 'suppressed', reasons: r.reasons || [] });
}

// ---------------------------------------------------------------------------------- AI call
async function aiCallExecute(ctx) {
  const { config, run } = ctx;
  if (ctx.dry) return completed(ctx.dryOptions?.callOutcome || 'answered', { simulated: true }, { call: ctx.dryOptions?.call || { outcome: ctx.dryOptions?.callOutcome || 'answered', reached: true } });
  const lead = await leadOf(ctx);
  if (!lead || lead.isDeleted) return completed('blocked', { blocked: true, reason: 'lead_unavailable' });
  if (!(lead.mobile || lead.phone || lead.normalizedPhone)) return completed('blocked', { blocked: true, reason: 'missing_phone' });
  const gate = await contactGate(ctx, 'phone');
  if (gate) return gate;

  const { default: CallingAgent } = await import('../../aiCalling/callingAgent.model.js');
  const { default: CallCampaign } = await import('../../aiCalling/callCampaign.model.js');
  const agent = await CallingAgent.findById(config.agentId).lean();
  if (!agent || agent.availability === 'archived') return failed('agent_unavailable', 'The selected AI agent no longer exists or is archived');
  if (agent.usage === 'inbound') return failed('agent_inbound_only', `${agent.name} only answers incoming calls`);
  if (agent.availability !== 'active') return retry(15 * MIN, `agent_${agent.availability}`);

  const { default: calling, assertQuestionnaire } = await import('../../aiCalling/aiCalling.service.js');
  try { assertQuestionnaire(agent.questionnaire || {}); } catch (e) { return failed('agent_not_ready', e.message); }
  const owner = agent.createdBy;
  const launchKey = `wf-${ctx.keyHash.slice(0, 40)}`;
  let campaign = await CallCampaign.findOne({ createdBy: owner, agentId: agent._id, launchKey }).lean();
  try {
    if (!campaign) {
      campaign = await calling.createCampaign({
        name: `Workflow · ${lead.name || 'Lead'}`.slice(0, 160),
        description: `Workflow automation: ${ctx.workflow?.name || ''}`.slice(0, 500),
        channel: 'voice',
        agentConfig: { ...(agent.agentConfig || {}), agentName: agent.name },
        questionnaire: agent.questionnaire, statusRules: agent.statusRules || [],
        schedule: { ...(agent.schedule || {}), maxAttemptsPerLead: config.maxAttempts, retryDelayMinutes: config.retryDelayMinutes },
        transport: agent.transport || 'cloud_sip', pairedDeviceId: agent.transport === 'paired_phone' ? agent.pairedDeviceId : null,
        selection: { mode: 'explicit', leadIds: [String(lead._id)] }, scheduledAt: null,
      }, owner, {}, {
        agentId: agent._id, kind: 'workflow', workflowRunId: run._id, launchKey, initializationPending: true,
        agentSnapshot: { name: agent.name, title: agent.title, description: agent.description, avatarFileId: agent.avatarFileId, avatarPresetId: agent.avatarPresetId, version: agent.version, agentType: agent.agentType || 'custom' },
      });
    }
    if (campaign.initializationPending) await calling.recoverCampaignInitialization(campaign._id, owner);
    if (['draft', 'paused', 'scheduled'].includes(campaign.status)) {
      await calling.startCampaign(campaign._id, owner, { startNow: false, scheduledAt: null }, { ipAddress: 'workflow' });
    }
  } catch (error) {
    if (error?.code === 11000) return retry(30_000, 'launch_race');
    if (isInfraError(error)) return retry(10 * MIN, `calling_unavailable: ${error.message}`);
    if (/no eligible recipient/i.test(error?.message || '') && campaign?._id) {
      const { default: CampaignRecipient } = await import('../../aiCalling/campaignRecipient.model.js');
      const rec = await CampaignRecipient.findOne({ campaignId: campaign._id }).select('state eligibility').lean();
      await CallCampaign.updateOne({ _id: campaign._id, status: 'draft' }, { $set: { status: 'cancelled', cancelledAt: new Date() } });
      return completed('blocked', { blocked: true, reason: (rec?.eligibility?.reasons || [])[0] || 'ineligible', reasons: rec?.eligibility?.reasons || [], campaignId: str(campaign._id) });
    }
    if (campaign?._id) await CallCampaign.updateOne({ _id: campaign._id, status: 'draft' }, { $set: { status: 'cancelled', cancelledAt: new Date() } });
    return failed('call_launch_refused', error?.message || 'Call launch refused');
  }
  return {
    status: 'waiting',
    wait: { kind: 'ai_call', until: new Date(Date.now() + config.timeoutHours * HOUR), data: { campaignId: str(campaign._id), owner: str(owner), agentId: str(agent._id) } },
    pollAt: new Date(Date.now() + 5 * MIN),
    output: { campaignId: str(campaign._id), agentId: str(agent._id) },
  };
}

function answersMap(call) {
  const out = {};
  for (const a of call?.answers || []) {
    if (!a?.questionFieldKey || a.validation === 'invalid' || a.validation === 'unknown') continue;
    out[a.questionFieldKey] = a.normalizedValue ?? a.rawAnswer ?? null;
  }
  return out;
}

export function callOutcome(recipientState, disposition) {
  if (recipientState === 'completed') return REACHED_DISPOSITIONS.includes(disposition) ? 'answered' : 'unanswered';
  if (recipientState === 'exhausted') return 'unanswered';
  if (['suppressed', 'ineligible'].includes(recipientState)) return 'blocked';
  if (recipientState === 'failed') return ['no_answer', 'busy', 'voicemail'].includes(disposition) ? 'unanswered' : 'failed';
  if (recipientState === 'cancelled') return 'failed';
  return null; // not terminal
}

async function aiCallResume(ctx) {
  const { wait } = ctx.run;
  const campaignId = wait?.data?.campaignId;
  const { default: CampaignRecipient } = await import('../../aiCalling/campaignRecipient.model.js');
  const { default: CallRecord } = await import('../../aiCalling/callRecord.model.js');
  const recipient = campaignId ? await CampaignRecipient.findOne({ campaignId }).lean() : null;
  const call = recipient?.lastCallId ? await CallRecord.findById(recipient.lastCallId)
    .select('disposition qualification state answers durationSeconds callNotes conversationState answeredAt endedAt resultsProcessedAt').lean() : null;
  // A recipient can be terminal a moment before its last call is stamped processed.
  const outcome = recipient && (!call || call.resultsProcessedAt) ? callOutcome(recipient.state, call?.disposition) : null;
  if (!outcome) {
    if (ctx.timedOut) {
      try {
        const { default: calling } = await import('../../aiCalling/aiCalling.service.js');
        await calling.cancelCampaign(campaignId, wait.data.owner, { ipAddress: 'workflow' });
      } catch { /* already finished or cancelled */ }
      return completed('failed', { campaignId, reason: 'timeout' }, { call: { outcome: 'failed', reason: 'timeout', campaignId } });
    }
    return { status: 'waiting', wait, pollAt: new Date(Date.now() + 5 * MIN) };
  }
  const snapshot = {
    outcome, campaignId, callId: str(call?._id), disposition: call?.disposition || null, qualification: call?.qualification || null,
    reached: REACHED_DISPOSITIONS.includes(call?.disposition), attempts: recipient.attemptCount || 0,
    answers: answersMap(call), durationSeconds: call?.durationSeconds ?? null, summary: call?.callNotes?.summary || null,
    callbackRequested: call?.disposition === 'callback_requested' || Boolean(call?.conversationState?.control?.callbackRequestedAt),
    callbackRequestedAt: call?.conversationState?.control?.callbackRequestedAt || null, recipientState: recipient.state,
  };
  return completed(outcome, snapshot, { call: snapshot });
}

// ---------------------------------------------------------------------------------- AI analysis
const QUAL_PORT = { qualified: 'qualified', unqualified: 'not_qualified', do_not_contact: 'not_qualified', callback: 'callback' };

async function analyzeExecute(ctx) {
  const call = ctx.run.context?.call;
  if (ctx.dry) {
    const q = ctx.dryOptions?.analysis || 'qualified';
    return completed(q, { simulated: true }, { analysis: { qualification: q } });
  }
  if (!call?.callId) return completed('unknown', { reason: 'no_call' }, { analysis: { qualification: 'unknown', reason: 'no_call' } });
  return analyzeResume(ctx);
}

async function analyzeResume(ctx) {
  const callId = ctx.run.context?.call?.callId;
  const { default: CallRecord } = await import('../../aiCalling/callRecord.model.js');
  const call = await CallRecord.findById(callId).select('answers qualification disposition intelligence callNotes conversationState').lean();
  if (!call) return completed('unknown', { reason: 'call_missing' }, { analysis: { qualification: 'unknown', reason: 'call_missing' } });
  const intel = call.intelligence || {};
  const waitMinutes = ctx.config.waitForIntelligenceMinutes;
  const started = ctx.run.wait?.startedAt || ctx.step?.startedAt || new Date();
  if (intel.status === 'pending' && waitMinutes > 0 && Date.now() - new Date(started).getTime() < waitMinutes * MIN && !ctx.timedOut) {
    return { status: 'waiting', wait: { kind: 'analysis', until: new Date(new Date(started).getTime() + waitMinutes * MIN), data: { callId: str(callId) } }, pollAt: new Date(Date.now() + MIN) };
  }
  // Only evidence-backed, non-rejected intelligence is used — nothing is inferred here.
  const items = (intel.items || []).filter((i) => i.status !== 'user_rejected');
  const byCategory = (cat) => items.filter((i) => i.category === cat).map((i) => i.value || i.quote).filter(Boolean).slice(0, 10);
  const fields = answersMap(call);
  const callbackRequested = call.disposition === 'callback_requested' || Boolean(call.conversationState?.control?.callbackRequestedAt);
  const qualification = callbackRequested && call.qualification !== 'qualified' ? 'callback' : (call.qualification || 'none');
  const analysis = {
    callId: str(callId), qualification, disposition: call.disposition || null,
    interest: fields.interest ?? null, callbackRequested, objections: byCategory('objection'), needs: byCategory('need'),
    budget: byCategory('budget')[0] ?? null, authority: byCategory('authority')[0] ?? null, timeline: byCategory('timeline')[0] ?? null,
    urgency: byCategory('urgency')[0] ?? null, fields, summary: call.callNotes?.summary || null,
    intelligenceStatus: intel.status || 'none',
  };
  return completed(QUAL_PORT[qualification] || 'unknown', analysis, { analysis });
}

// ---------------------------------------------------------------------------------- Callback
async function callbackExecute(ctx) {
  const { config, run } = ctx;
  if (ctx.dry) return completed('out', { simulated: true });
  const lead = await leadOf(ctx);
  if (!lead || lead.isDeleted) return failed('lead_unavailable', 'The lead no longer exists');
  const { resolveCallbackTime } = await import('../../aiCalling/engine/callbackTime.js');
  const { recipientTimezone } = await import('../../aiCalling/engine/callWindow.js');
  const timezone = recipientTimezone(lead.address?.country) || 'UTC';
  let agent = null;
  if (config.agentId) {
    const { default: CallingAgent } = await import('../../aiCalling/callingAgent.model.js');
    agent = await CallingAgent.findById(config.agentId).lean();
    if (!agent || agent.availability === 'archived') return failed('agent_unavailable', 'The selected AI agent no longer exists or is archived');
  }
  const requested = config.useRequestedTime ? (run.context?.call?.callbackRequestedAt || null) : null;
  const resolved = resolveCallbackTime(requested, {
    now: new Date(), timezone, defaultDelayMinutes: config.delayMinutes,
    schedule: agent ? { ...(agent.followUp?.schedule || agent.schedule || {}), timezone } : null,
  });
  const { default: followUps } = await import('../../crm/leadFollowUp.service.js');
  const ownerId = lead.assignedTo || run.ownerId;
  const note = renderText(config.note, { lead, run, workflowName: ctx.workflow?.name });
  const fu = await followUps.upsertFromSource({
    sourceKey: `wf:${ctx.keyHash.slice(0, 60)}`, leadId: lead._id, ownerId, dueAt: resolved.at, timezone, channel: 'phone',
    note: note || `Callback scheduled by workflow "${ctx.workflow?.name || ''}"`,
    source: { type: 'workflow', callRecordId: run.context?.call?.callId || null, requestedTimeText: requested ? String(requested).slice(0, 300) : null },
  });
  let aiAssigned = false;
  if (agent && String(fu.automation?.agentId || '') !== String(agent._id)) {
    const { default: followUpCalling } = await import('../../aiCalling/followUpCalling.service.js');
    try {
      await followUpCalling.assignAgent(fu._id, { agentId: agent._id, dueAt: resolved.at }, { id: String(agent.createdBy), isSupervisor: true }, { ipAddress: 'workflow' });
      aiAssigned = true;
    } catch (e) {
      // The follow-up exists for a person either way; record why the AI could not take it.
      await recordLeadAction(ctx, 'automation.action', { kind: 'callback_ai_refused', reason: e.message });
    }
  } else if (agent) aiAssigned = true;
  const output = { followUpId: str(fu._id), dueAt: resolved.at, timezone, kind: resolved.kind, shifted: resolved.shifted, aiAssigned };
  await recordLeadAction(ctx, 'automation.action', { kind: 'callback_scheduled', followUpId: output.followUpId, dueAt: resolved.at });
  if (!config.waitForCompletion) return completed('out', output, { callback: output });
  return { status: 'waiting', wait: { kind: 'callback', until: new Date(Date.now() + config.timeoutHours * HOUR), data: output }, pollAt: new Date(Date.now() + 5 * MIN), output };
}

async function callbackResume(ctx) {
  const data = ctx.run.wait?.data || {};
  const { default: LeadFollowUp } = await import('../../crm/leadFollowUp.model.js');
  const fu = await LeadFollowUp.findById(data.followUpId).select('status closedAt automation.state').lean();
  if (fu && ['done', 'cancelled'].includes(fu.status)) {
    const out = { ...data, followUpStatus: fu.status, closedAt: fu.closedAt };
    return completed(fu.status === 'done' ? 'out' : 'failed', out, { callback: out });
  }
  if (ctx.timedOut) return completed('failed', { ...data, reason: 'timeout' });
  return { status: 'waiting', wait: ctx.run.wait, pollAt: new Date(Date.now() + 5 * MIN) };
}

// ---------------------------------------------------------------------------------- Messages
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function messageExecute(ctx) {
  const { config, run, node } = ctx;
  const channel = NODE_CATALOG[node.type].channel;
  if (ctx.dry) return completed(ctx.dryOptions?.messageOutcome || 'sent', { simulated: true, channel });
  const lead = await leadOf(ctx);
  if (!lead || lead.isDeleted) return completed('blocked', { blocked: true, reason: 'lead_unavailable' });
  const gate = await contactGate(ctx, channel);
  if (gate) return gate;

  let linkUrl = null;
  if (config.trackedLinkUrl) {
    const { default: links } = await import('../workflowLink.service.js');
    linkUrl = (await links.ensure({ actionKey: ctx.actionKey, url: config.trackedLinkUrl, run, nodeId: node.id })).trackedUrl;
  }
  const content = {};
  if (channel === 'sms') content.bodyText = config.body || undefined;
  if (channel === 'email') {
    if (config.subject) content.subject = config.subject;
    if (config.body) { content.bodyText = config.body; content.bodyHtml = `<p>${escapeHtml(config.body).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>')}</p>`; }
  }
  if (linkUrl) content.fallbackValues = { link: linkUrl };
  let openPixel = null;
  if (channel === 'email' && config.trackOpens !== false && content.bodyHtml) {
    const { default: links } = await import('../workflowLink.service.js');
    openPixel = (await links.ensure({ actionKey: `${ctx.actionKey}:open`, run, nodeId: node.id, kind: 'open' })).trackedUrl;
    content.bodyHtml += `<img src="${openPixel}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0" />`;
  }
  for (const k of Object.keys(content)) if (content[k] === undefined) delete content[k];

  const { default: messaging } = await import('../../messaging/messaging.service.js');
  const { default: MessageRecipient } = await import('../../messaging/messageRecipient.model.js');
  const { default: MessageCampaign } = await import('../../messaging/campaign.model.js');
  let campaign;
  try {
    campaign = await messaging.createCampaign({
      name: `Workflow · ${ctx.workflow?.name || ''}`.slice(0, 160), description: `Workflow automation step ${node.id}`.slice(0, 500),
      channel, purpose: config.purpose, ...(config.templateId ? { templateId: config.templateId } : {}),
      content, selection: { mode: 'explicit', leadIds: [String(lead._id)] }, timezone: 'UTC',
      idempotencyKey: `wf-${ctx.keyHash.slice(0, 40)}`,
    }, run.ownerId, { ipAddress: 'workflow' });
  } catch (error) {
    if (isInfraError(error)) return retry(10 * MIN, `messaging_unavailable: ${error.message}`);
    if (error?.statusCode === 409 && /pending/i.test(error.message)) return retry(MIN, 'messaging_pending');
    return failed('message_refused', error?.message);
  }
  const recipient = await MessageRecipient.findOne({ campaignId: campaign._id }).select('status eligibility').lean();
  const output = { channel, campaignId: str(campaign._id), recipientId: str(recipient?._id), trackedUrl: linkUrl, openTracking: Boolean(openPixel) };
  if (!recipient || ['suppressed', 'ineligible'].includes(recipient.status)) {
    await MessageCampaign.updateOne({ _id: campaign._id, status: 'draft' }, { $set: { status: 'cancelled' } }).catch(() => {});
    return completed('blocked', { ...output, blocked: true, reason: recipient?.eligibility?.reasons?.[0] || 'ineligible', reasons: recipient?.eligibility?.reasons || [] });
  }
  if (['draft', 'paused'].includes(campaign.status)) {
    try { await messaging.startCampaign(campaign._id, run.ownerId, {}, { ipAddress: 'workflow' }); } catch (error) {
      if (isInfraError(error)) return retry(10 * MIN, `messaging_unavailable: ${error.message}`);
      if (!/only draft or paused/i.test(error?.message || '')) return failed('message_refused', error?.message);
    }
  }
  const message = { ...output, status: 'queued', queuedAt: new Date() };
  await recordLeadAction(ctx, 'automation.action', { kind: `message_${channel}`, campaignId: output.campaignId });
  return completed('sent', message, { message });
}

// ---------------------------------------------------------------------------------- Notifications / tasks
async function recipientsFor(ctx, mode, userIds = []) {
  const lead = await leadOf(ctx);
  if (mode === 'users') return userIds.map(String);
  if (mode === 'assigned' && lead?.assignedTo) return [String(lead.assignedTo)];
  return [String(ctx.run.ownerId)];
}

async function notifyExecute(ctx) {
  const { config, run } = ctx;
  if (ctx.dry) return completed('out', { simulated: true });
  const lead = await leadOf(ctx);
  const recipientIds = await recipientsFor(ctx, config.recipients, config.userIds);
  const text = (t) => renderText(t, { lead, run, workflowName: ctx.workflow?.name });
  const { default: notifications } = await import('../../notifications/notification.service.js');
  try {
    await notifications.create({
      channels: ['IN_APP', 'PUSH'], recipientIds, type: 'workflow_automation', category: 'CRM', priority: config.priority,
      payload: { title: text(config.title).slice(0, 200), message: text(config.message).slice(0, 1000), leadId: str(run.leadId), runId: str(run._id), url: `/leads?detail=${run.leadId}` },
      sourceModule: 'workflowAutomation', sourceEvent: 'notify', sourceEntityType: 'Lead', sourceEntityId: run.leadId,
      idempotencyKey: `wf-${ctx.keyHash.slice(0, 48)}`,
    }, run.ownerId, { ipAddress: 'workflow' });
  } catch (error) {
    if (error?.statusCode !== 409) {
      if (isInfraError(error)) return retry(5 * MIN, error.message);
      return failed('notification_failed', error?.message);
    }
  }
  return completed('out', { recipientIds });
}

async function taskExecute(ctx) {
  const { config, run } = ctx;
  if (ctx.dry) return completed('out', { simulated: true });
  const lead = await leadOf(ctx);
  const text = (t) => renderText(t, { lead, run, workflowName: ctx.workflow?.name });
  const title = text(config.title).slice(0, 255) || 'Follow up';
  const assignees = config.assignee === 'user' ? [String(config.userId)] : await recipientsFor(ctx, config.assignee);
  const { default: Task } = await import('../../tasks/task.model.js');
  const existing = await Task.findOne({ 'source.type': 'WORKFLOW', 'source.refId': run._id, title }).select('_id').lean();
  if (existing) return completed('out', { taskId: str(existing._id), replayed: true });
  const { default: tasks } = await import('../../tasks/task.service.js');
  try {
    const task = await tasks.create({
      title, description: text(config.description || '').slice(0, 5000), assigneeIds: assignees, priority: config.priority,
      dueDate: new Date(Date.now() + config.dueInHours * HOUR),
      source: { type: 'WORKFLOW', refId: run._id, label: `Workflow: ${ctx.workflow?.name || ''}`.slice(0, 255) },
    }, run.ownerId, { ipAddress: 'workflow' });
    return completed('out', { taskId: str(task?._id || task?.id) });
  } catch (error) {
    if (isInfraError(error)) return retry(5 * MIN, error.message);
    return failed('task_failed', error?.message);
  }
}

// ---------------------------------------------------------------------------------- CRM
const leadMeta = (ctx) => ({ userId: ctx.run.ownerId, ipAddress: 'workflow', workflowId: ctx.run.workflowId });

async function updateLeadExecute(ctx) {
  const { config } = ctx;
  if (ctx.dry) return completed('out', { simulated: true, status: config.status, pipelineStage: config.pipelineStage });
  const lead = await leadOf(ctx);
  if (!lead || lead.isDeleted) return failed('lead_unavailable', 'The lead no longer exists');
  const patch = {};
  if (config.status && lead.status !== config.status) {
    // A converted lead is a closed sale: automation never moves it back.
    if (lead.status === 'converted') return completed('out', { skipped: 'lead_converted', previousStatus: lead.status });
    patch.status = config.status;
  }
  if (config.pipelineStage && lead.pipelineStage !== config.pipelineStage) patch.pipelineStage = config.pipelineStage;
  if (Object.keys(patch).length) {
    const { default: leadService } = await import('../../crm/lead.service.js');
    await leadService.update(String(lead._id), patch, leadMeta(ctx));
  }
  await recordLeadAction(ctx, 'automation.action', { kind: 'lead_updated', from: { status: lead.status, pipelineStage: lead.pipelineStage }, to: patch });
  return completed('out', { previous: { status: lead.status, pipelineStage: lead.pipelineStage }, changed: patch });
}

async function tagsExecute(ctx) {
  const { config } = ctx;
  if (ctx.dry) return completed('out', { simulated: true });
  const lead = await leadOf(ctx);
  if (!lead || lead.isDeleted) return failed('lead_unavailable', 'The lead no longer exists');
  const current = lead.tags || [];
  const remove = new Set((config.remove || []).map((t) => String(t).trim().toLowerCase()));
  const next = [...new Set([...current.filter((t) => !remove.has(String(t).toLowerCase())), ...(config.add || []).map((t) => String(t).trim()).filter(Boolean)])].slice(0, 100);
  if (JSON.stringify(next) !== JSON.stringify(current)) {
    const { default: leadService } = await import('../../crm/lead.service.js');
    await leadService.update(String(lead._id), { tags: next }, leadMeta(ctx));
  }
  return completed('out', { tags: next });
}

async function customFieldsExecute(ctx) {
  const { config, run } = ctx;
  const lead = ctx.dry ? null : await leadOf(ctx);
  const set = (config.set || []).map((f) => ({ key: String(f.key), value: renderText(f.value, { lead, run, workflowName: ctx.workflow?.name }).slice(0, 500) }));
  if (ctx.dry) return completed('out', { simulated: true, set, remove: config.remove || [] });
  if (!lead || lead.isDeleted) return failed('lead_unavailable', 'The lead no longer exists');
  const current = { ...(lead.customFields || {}) };
  const next = { ...current };
  for (const k of config.remove || []) delete next[k];
  for (const f of set) next[f.key] = f.value;
  if (Object.keys(next).length > 50) return failed('too_many_custom_fields', 'A lead can hold at most 50 custom fields');
  const changed = JSON.stringify(next) !== JSON.stringify(current);
  if (changed) {
    const { default: leadService } = await import('../../crm/lead.service.js');
    await leadService.update(String(lead._id), { customFields: next }, leadMeta(ctx));
    await recordLeadAction(ctx, 'automation.action', { kind: 'custom_fields', set, remove: config.remove || [] });
  }
  return completed('out', { customFields: next, changed });
}

async function assignExecute(ctx) {
  const { config } = ctx;
  if (ctx.dry) return completed('out', { simulated: true, userId: config.userId });
  const lead = await leadOf(ctx);
  if (!lead || lead.isDeleted) return failed('lead_unavailable', 'The lead no longer exists');
  const { default: User } = await import('../../auth/user.model.js');
  const user = await User.findById(config.userId).select('_id status').lean();
  if (!user || user.status !== 'active') return failed('user_unavailable', 'The selected user is not active');
  if (String(lead.assignedTo || '') !== String(config.userId)) {
    const { default: leadService } = await import('../../crm/lead.service.js');
    await leadService.update(String(lead._id), { assignedTo: String(config.userId) }, leadMeta(ctx));
  }
  return completed('out', { assignedTo: String(config.userId), previous: str(lead.assignedTo) });
}

async function noteExecute(ctx) {
  const { config, run } = ctx;
  const lead = ctx.dry ? null : await leadOf(ctx);
  const text = renderText(config.text, { lead, run, workflowName: ctx.workflow?.name }).slice(0, 1000);
  if (ctx.dry) return completed('out', { simulated: true, text });
  if (!lead || lead.isDeleted) return failed('lead_unavailable', 'The lead no longer exists');
  // Timeline entry is the durable record; the lead's notes field is appended only while it fits
  // (never truncating what a person wrote).
  await recordLeadAction(ctx, 'automation.action', { kind: 'note', text });
  const line = `[${new Date().toISOString().slice(0, 16).replace('T', ' ')}] ${text}`;
  const existing = lead.notes || '';
  let appended = false;
  if (!existing.includes(line) && existing.length + line.length + 1 <= 5000) {
    const { default: leadService } = await import('../../crm/lead.service.js');
    await leadService.update(String(lead._id), { notes: existing ? `${existing}\n${line}` : line }, leadMeta(ctx));
    appended = true;
  }
  return completed('out', { text, appendedToNotes: appended });
}

async function qualificationExecute(ctx) {
  const { config, run } = ctx;
  const lead = ctx.dry ? null : await leadOf(ctx);
  const value = renderText(config.value, { lead, run, workflowName: ctx.workflow?.name }).slice(0, 500);
  if (ctx.dry) return completed('out', { simulated: true, fieldKey: config.fieldKey, value });
  if (!value) return completed('out', { skipped: 'empty_value', fieldKey: config.fieldKey });
  const { default: qualification } = await import('../../crm/leadQualification.service.js');
  const changed = await qualification.mergeAnswers(String(run.leadId), [{
    fieldKey: config.fieldKey, label: config.fieldKey, value, status: 'answered', source: 'user', evidence: `Workflow: ${ctx.workflow?.name || ''}`,
  }], { source: 'user', userId: run.ownerId, reason: 'workflow_automation' });
  return completed('out', { fieldKey: config.fieldKey, value, changed });
}

async function followUpExecute(ctx) {
  const { config, run } = ctx;
  if (ctx.dry) return completed('out', { simulated: true, dueInHours: config.dueInHours, channel: config.channel });
  const lead = await leadOf(ctx);
  if (!lead || lead.isDeleted) return failed('lead_unavailable', 'The lead no longer exists');
  const ownerId = config.assignee === 'user' ? config.userId : config.assignee === 'assigned' && lead.assignedTo ? lead.assignedTo : run.ownerId;
  const { recipientTimezone } = await import('../../aiCalling/engine/callWindow.js');
  const { default: followUps } = await import('../../crm/leadFollowUp.service.js');
  const fu = await followUps.upsertFromSource({
    sourceKey: `wf:${ctx.keyHash.slice(0, 60)}`, leadId: lead._id, ownerId, dueAt: new Date(Date.now() + config.dueInHours * HOUR),
    timezone: recipientTimezone(lead.address?.country) || null, channel: config.channel,
    note: renderText(config.note, { lead, run, workflowName: ctx.workflow?.name }) || `Follow-up from workflow "${ctx.workflow?.name || ''}"`,
    source: { type: 'workflow' },
  });
  await recordLeadAction(ctx, 'automation.action', { kind: 'follow_up_created', followUpId: str(fu._id) });
  return completed('out', { followUpId: str(fu._id), dueAt: fu.dueAt, ownerId: str(fu.ownerId) });
}

// ---------------------------------------------------------------------------------- Integrations
const PRIVATE_V4 = [[0x0a000000, 8], [0xac100000, 12], [0xc0a80000, 16], [0x7f000000, 8], [0xa9fe0000, 16], [0x64400000, 10], [0x00000000, 8], [0xe0000000, 4]];
export function isPrivateAddress(ip) {
  if (!ip) return true;
  if (ip.includes(':')) {
    const v = ip.toLowerCase();
    if (v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb')) return true;
    const mapped = /::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    return mapped ? isPrivateAddress(mapped[1]) : false;
  }
  const n = ip.split('.').reduce((acc, o) => ((acc << 8) + Number(o)) >>> 0, 0);
  return PRIVATE_V4.some(([base, bits]) => ((n >>> (32 - bits)) << (32 - bits)) >>> 0 === base);
}

/** SSRF guard: HTTPS only, every resolved address must be public, no redirects. */
export async function assertPublicHttpsUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw Object.assign(new Error('Invalid URL'), { code: 'invalid_url' }); }
  if (url.protocol !== 'https:') throw Object.assign(new Error('Only https:// URLs are allowed'), { code: 'https_required' });
  if (url.username || url.password) throw Object.assign(new Error('Credentials in URLs are not allowed'), { code: 'invalid_url' });
  const { lookup } = await import('node:dns/promises');
  const addrs = await lookup(url.hostname, { all: true }).catch(() => []);
  if (!addrs.length) throw Object.assign(new Error('Host could not be resolved'), { code: 'host_unresolved', transient: true });
  if (addrs.some((a) => isPrivateAddress(a.address))) throw Object.assign(new Error('Private or internal addresses are not allowed'), { code: 'private_address' });
  return url;
}

async function webhookExecute(ctx) {
  const { config, run, node } = ctx;
  if (ctx.dry) return completed('out', { simulated: true, url: config.url });
  let url;
  try { url = await assertPublicHttpsUrl(config.url); } catch (e) {
    if (e.transient && (ctx.step?.attempt || 1) < 3) return retry(5 * MIN, e.message);
    return failed(e.code || 'webhook_refused', e.message);
  }
  const lead = config.includeLead ? await leadOf(ctx) : null;
  const body = JSON.stringify({
    event: 'workflow.step', workflowId: str(run.workflowId), workflowName: ctx.workflow?.name || '', runId: str(run._id), nodeId: node.id, sentAt: new Date().toISOString(),
    lead: lead ? { id: str(lead._id), name: lead.name || null, email: lead.email || null, phone: lead.mobile || lead.phone || null, status: lead.status || null } : null,
    data: { call: run.context?.call ? { outcome: run.context.call.outcome, disposition: run.context.call.disposition, qualification: run.context.call.qualification, answers: run.context.call.answers } : null, analysis: run.context?.analysis || null, event: run.context?.event || null },
  });
  const headers = { 'Content-Type': 'application/json', 'User-Agent': 'Updata-Workflow/1.0', 'X-Updata-Idempotency-Key': ctx.keyHash.slice(0, 40) };
  const secret = process.env.WORKFLOW_WEBHOOK_SECRET;
  if (secret) {
    const crypto = await import('node:crypto');
    headers['X-Updata-Signature'] = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
  }
  try {
    const res = await fetch(url, { method: 'POST', headers, body, redirect: 'manual', signal: AbortSignal.timeout(config.timeoutSeconds * 1000) });
    if (res.status >= 200 && res.status < 300) return completed('out', { status: res.status });
    if ((res.status >= 500 || res.status === 429) && (ctx.step?.attempt || 1) < 5) return retry(Math.min(60, 2 ** (ctx.step?.attempt || 1)) * MIN, `HTTP ${res.status}`);
    return failed('webhook_http_error', `The receiving system answered HTTP ${res.status}`);
  } catch (e) {
    if ((ctx.step?.attempt || 1) < 5) return retry(Math.min(60, 2 ** (ctx.step?.attempt || 1)) * MIN, e.message);
    return failed('webhook_unreachable', e.message);
  }
}

// ---------------------------------------------------------------------------------- Logic
async function conditionExecute(ctx) {
  const tree = ctx.config.rules;
  const fields = collectFields(tree);
  const values = ctx.dry && ctx.dryOptions?.values
    ? new Map([...fields].map((f) => [f, ctx.dryOptions.values[f]]))
    : await resolveFields(fields, { run: ctx.run, lead: ctx._lead });
  const { result, trace } = evaluateCondition(tree, values);
  return completed(result ? 'yes' : 'no', { result, trace });
}

async function delayExecute(ctx) {
  const lead = ctx.dry ? null : await leadOf(ctx);
  const { at, timezone, timezoneSource, shifted } = computeDelayUntil(ctx.config, { lead });
  const output = { until: at, timezone, timezoneSource, shifted };
  if (ctx.dry || at.getTime() <= Date.now() + 1000) return completed('out', { ...output, simulated: Boolean(ctx.dry) });
  return { status: 'waiting', wait: { kind: 'timer', until: at, data: output }, output };
}

async function delayResume(ctx) {
  if (ctx.run.wait?.until && new Date(ctx.run.wait.until) > new Date()) return { status: 'waiting', wait: ctx.run.wait };
  return completed('out', ctx.run.wait?.data || null);
}

async function waitEventExecute(ctx) {
  if (ctx.dry) return completed(ctx.dryOptions?.eventOutcome || 'matched', { simulated: true });
  const until = new Date(Date.now() + ctx.config.timeoutHours * HOUR);
  // Close the race with signals that arrived while this run was busy (recorded per lead).
  const { WorkflowEvent } = await import('../workflow.models.js');
  const since = ctx.step?.startedAt ? new Date(ctx.step.startedAt) : new Date();
  const early = await WorkflowEvent.findOne({
    leadId: ctx.run.leadId, type: { $in: ctx.config.events.map((e) => `signal.${e}`) }, at: { $gte: since },
    'data.excludeWorkflowId': { $ne: String(ctx.run.workflowId) },
  }).sort({ at: 1 }).lean();
  if (early) return completed('matched', { event: early.type.slice('signal.'.length), data: early.data, at: early.at }, { event: { type: early.type.slice('signal.'.length), ...(early.data || {}) } });
  return { status: 'waiting', wait: { kind: 'event', until, events: ctx.config.events } };
}

async function waitEventResume(ctx) {
  const ev = ctx.run.wait?.resumeEvent;
  if (ev) return completed('matched', { event: ev.type, data: ev.data || null, at: ev.at }, { event: { type: ev.type, ...(ev.data || {}) } });
  if (ctx.timedOut) return completed('timeout', { timedOutAt: new Date() });
  return { status: 'waiting', wait: ctx.run.wait };
}

async function endExecute(ctx) {
  const { config, run } = ctx;
  const status = config.updateLeadStatus ? END_OUTCOME_LEAD_STATUS[config.outcome] : null;
  if (ctx.dry) return { status: 'completed', port: null, output: { simulated: true, outcome: config.outcome, leadStatus: status }, end: config.outcome };
  let changed = null;
  if (status) {
    const lead = await leadOf(ctx);
    if (lead && !lead.isDeleted && lead.status !== status && lead.status !== 'converted') {
      const { default: leadService } = await import('../../crm/lead.service.js');
      await leadService.update(String(lead._id), { status }, leadMeta(ctx));
      changed = { from: lead.status, to: status };
    }
  }
  if (config.note) {
    const lead = await leadOf(ctx);
    await recordLeadAction(ctx, 'automation.action', { kind: 'note', text: renderText(config.note, { lead, run, workflowName: ctx.workflow?.name }).slice(0, 1000) });
  }
  return { status: 'completed', port: null, output: { outcome: config.outcome, leadStatus: changed }, end: config.outcome };
}

const triggerExecute = async () => completed('out');

export const HANDLERS = {
  'ai.call': { execute: aiCallExecute, resume: aiCallResume },
  'ai.analyze': { execute: analyzeExecute, resume: analyzeResume },
  'ai.callback': { execute: callbackExecute, resume: callbackResume },
  'msg.sms': { execute: messageExecute },
  'msg.whatsapp': { execute: messageExecute },
  'msg.email': { execute: messageExecute },
  'notify.user': { execute: notifyExecute },
  'task.create': { execute: taskExecute },
  'crm.update_lead': { execute: updateLeadExecute },
  'crm.add_tags': { execute: tagsExecute },
  'crm.assign': { execute: assignExecute },
  'crm.add_note': { execute: noteExecute },
  'crm.qualification': { execute: qualificationExecute },
  'crm.follow_up': { execute: followUpExecute },
  'crm.custom_fields': { execute: customFieldsExecute },
  'integration.webhook': { execute: webhookExecute },
  'logic.condition': { execute: conditionExecute },
  'logic.delay': { execute: delayExecute, resume: delayResume },
  'logic.wait_event': { execute: waitEventExecute, resume: waitEventResume },
  end: { execute: endExecute },
};
for (const type of Object.keys(NODE_CATALOG)) if (NODE_CATALOG[type].category === 'trigger') HANDLERS[type] = { execute: triggerExecute };

export const __test__ = { callOutcome, answersMap, isPrivateAddress, assertPublicHttpsUrl };
