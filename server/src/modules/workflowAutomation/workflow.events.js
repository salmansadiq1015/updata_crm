/**
 * Bridges domain events (published by crm / aiCalling / inboundCalling / messaging and the
 * workflow link + webhook endpoints) into Workflow Automation:
 *   1. start runs of PUBLISHED workflows whose trigger matches (idempotent enrollmentKey)
 *   2. resume runs that wait for the event (logic.wait_event) or poke ai.call waits
 *   3. record a per-lead `signal.*` event while the lead has active runs (unified timeline +
 *      closes the race where a signal lands while a run is still executing)
 *   4. cancel active runs when the lead opts out (workflow setting stopOnOptOut)
 *
 * Handlers never throw into the publisher (EventBus wraps them and dead-letters failures).
 */
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import logger from '../../shared/logger/index.js';
import runner, { recordEvent } from './workflow.runner.js';
import { Workflow, WorkflowRun } from './workflow.models.js';
import { ACTIVE_RUN_STATUSES } from './workflow.constants.js';
import { normalizeConfig } from './engine/nodeConfig.js';

const CACHE_MS = 30_000;
const cache = new Map();
export function invalidateTriggerCache() { cache.clear(); }

async function publishedWith(triggerType) {
  const hit = cache.get(triggerType);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.list;
  const list = await Workflow.find({ status: 'published', triggerType, publishedVersionId: { $ne: null } })
    .select('_id name createdBy publishedVersionId triggerType triggerConfig settings').lean();
  cache.set(triggerType, { at: Date.now(), list });
  return list;
}

async function enrollAll(triggerType, leadId, { eventId, data, keySuffix, filter = () => true, excludeWorkflowId = null }) {
  if (!leadId) return 0;
  let n = 0;
  for (const wf of await publishedWith(triggerType)) {
    if (excludeWorkflowId && String(wf._id) === String(excludeWorkflowId)) continue;
    const config = normalizeConfig(triggerType, wf.triggerConfig);
    if (!filter(config, wf)) continue;
    const res = await runner.enroll({ workflow: wf, leadId, trigger: { type: triggerType, eventId, data }, enrollmentKey: `${wf._id}:${leadId}:${keySuffix}` });
    if (res.run) n += 1;
  }
  return n;
}

async function signal(leadId, waitEvent, data, { excludeWorkflowId = null, dedupeKey = null } = {}) {
  if (!leadId) return;
  if (await WorkflowRun.exists({ leadId, status: { $in: ACTIVE_RUN_STATUSES } })) {
    await recordEvent({ type: `signal.${waitEvent}`, leadId, data: { ...data, ...(excludeWorkflowId ? { excludeWorkflowId: String(excludeWorkflowId) } : {}) }, ...(dedupeKey ? { dedupeKey } : {}) });
  }
  await runner.resumeWaiting({ leadId, waitEvent, data, excludeWorkflowId });
}

export function callMatches(filter, p) {
  switch (filter) {
    case 'any': return true;
    case 'answered': return Boolean(p.reached);
    case 'unanswered': return !p.reached && ['no_answer', 'busy', 'voicemail'].includes(p.disposition);
    case 'failed': return !p.reached && !['no_answer', 'busy', 'voicemail'].includes(p.disposition);
    case 'qualified': return p.qualification === 'qualified';
    case 'not_qualified': return ['unqualified', 'do_not_contact'].includes(p.qualification);
    case 'callback_requested': return Boolean(p.callbackRequested);
    case 'do_not_contact': return p.disposition === 'do_not_contact';
    default: return false;
  }
}

export function inboundMatches(filter, p) {
  const outcome = String(p.outcome || '').toLowerCase();
  if (filter === 'any') return true;
  if (filter === 'handled') return ['handled_by_ai', 'handled_by_human', 'transferred'].includes(outcome);
  if (filter === 'missed') return ['missed', 'unanswered', 'rejected'].includes(outcome);
  if (filter === 'qualified') return String(p.qualification || '').toLowerCase() === 'qualified';
  return false;
}

async function cancelForOptOut(leadId, channel) {
  const runs = await WorkflowRun.find({ leadId, status: { $in: ACTIVE_RUN_STATUSES } }).select('_id workflowId').lean();
  for (const r of runs) {
    const wf = await Workflow.findById(r.workflowId).select('settings').lean();
    if (wf?.settings?.stopOnOptOut === false) continue;
    await runner.cancel(r._id, `opted_out_${channel}`);
  }
}

const handlers = {
  async [EVENT_TYPES.CRM_LEADS_CREATED]({ payload, id }) {
    const ids = (payload.leadIds || []).slice(0, 1000);
    const type = payload.origin === 'import' ? 'trigger.leads_imported' : 'trigger.lead_created';
    for (const leadId of ids) {
      await enrollAll(type, leadId, { eventId: id, data: { origin: payload.origin }, keySuffix: 'created' });
      // An import is also "a new lead": workflows on lead_created see imported leads too.
      if (type === 'trigger.leads_imported') await enrollAll('trigger.lead_created', leadId, { eventId: id, data: { origin: payload.origin }, keySuffix: 'created' });
    }
  },

  async [EVENT_TYPES.CRM_LEAD_UPDATED]({ payload, id }) {
    const { leadId, workflowId } = payload;
    await enrollAll('trigger.lead_updated', leadId, {
      eventId: id, data: payload, keySuffix: `updated:${id}`, excludeWorkflowId: workflowId,
      filter: (c) => (!c.fields?.length || c.fields.some((f) => (payload.changedFields || []).includes(f))) && (!c.toStatus || (payload.changedFields || []).includes('status') && payload.status === c.toStatus),
    });
    await signal(leadId, 'lead.updated', { changedFields: payload.changedFields, status: payload.status }, { excludeWorkflowId: workflowId });
  },

  async [EVENT_TYPES.AI_CALL_PROCESSED]({ payload, id }) {
    if (payload.workflowRunId) await runner.pokeRun(payload.workflowRunId);
    let originWorkflowId = null;
    if (payload.workflowRunId) originWorkflowId = (await WorkflowRun.findById(payload.workflowRunId).select('workflowId').lean())?.workflowId || null;
    await enrollAll('trigger.call_completed', payload.leadId, {
      eventId: id, data: payload, keySuffix: `call:${payload.callId}`, excludeWorkflowId: originWorkflowId,
      filter: (c) => callMatches(c.outcome, payload) && (!c.agentId || String(c.agentId) === String(payload.agentId)),
    });
    await signal(payload.leadId, 'call.completed', { callId: payload.callId, disposition: payload.disposition, qualification: payload.qualification, reached: payload.reached }, { dedupeKey: `signal:call:${payload.callId}` });
  },

  async [EVENT_TYPES.INBOUND_CALL_PROCESSED]({ payload, id }) {
    await enrollAll('trigger.inbound_call', payload.leadId, {
      eventId: id, data: payload, keySuffix: `inbound:${payload.inboundCallId}`, filter: (c) => inboundMatches(c.outcome, payload),
    });
    await signal(payload.leadId, 'inbound_call.completed', { inboundCallId: payload.inboundCallId, outcome: payload.outcome }, { dedupeKey: `signal:inbound:${payload.inboundCallId}` });
  },

  async [EVENT_TYPES.MESSAGE_RECEIVED]({ payload, id }) {
    if (payload.optOut) await cancelForOptOut(payload.leadId, payload.channel);
    if (!payload.optOut) {
      await enrollAll('trigger.message_received', payload.leadId, {
        eventId: id, data: { channel: payload.channel, text: payload.text }, keySuffix: `inbound-msg:${payload.provider}:${payload.messageId}`,
        filter: (c) => (c.channel === 'any' || c.channel === payload.channel) && (!c.keyword || String(payload.text || '').toLowerCase().includes(String(c.keyword).toLowerCase())),
      });
    }
    await signal(payload.leadId, 'message.replied', { channel: payload.channel, text: payload.text, optOut: payload.optOut }, { dedupeKey: `signal:msg:${payload.provider}:${payload.messageId}` });
  },

  async [EVENT_TYPES.MESSAGE_STATUS_CHANGED]({ payload, id }) {
    const status = ['failed', 'undelivered'].includes(payload.status) ? 'failed' : payload.status;
    if (!['delivered', 'read', 'failed'].includes(status)) return;
    await enrollAll('trigger.message_status', payload.leadId, {
      eventId: id, data: payload, keySuffix: `msg-status:${payload.recipientId}:${status}`,
      filter: (c) => (c.channel === 'any' || c.channel === payload.channel) && (c.status === status || (c.status === 'delivered' && status === 'read')),
    });
    const waitEvent = status === 'failed' ? 'message.failed' : 'message.delivered';
    await signal(payload.leadId, waitEvent, { channel: payload.channel, recipientId: payload.recipientId, status }, { dedupeKey: `signal:${waitEvent}:${payload.recipientId}` });
  },

  async [EVENT_TYPES.EMAIL_RECEIVED]({ payload, id }) {
    await enrollAll('trigger.message_received', payload.leadId, {
      eventId: id, data: { channel: 'email', text: payload.text, subject: payload.subject }, keySuffix: `inbound-email:${payload.messageId}`,
      filter: (c) => (c.channel === 'any' || c.channel === 'email') && (!c.keyword || `${payload.subject || ''} ${payload.text || ''}`.toLowerCase().includes(String(c.keyword).toLowerCase())),
    });
    await signal(payload.leadId, 'message.replied', { channel: 'email', text: payload.text, subject: payload.subject }, { dedupeKey: `signal:email:${payload.messageId}` });
  },

  async [EVENT_TYPES.MESSAGE_OPENED]({ payload, id }) {
    await enrollAll('trigger.message_status', payload.leadId, {
      eventId: id, data: payload, keySuffix: `msg-opened:${payload.linkId}`,
      filter: (c) => (c.channel === 'any' || c.channel === 'email') && c.status === 'opened',
    });
    await signal(payload.leadId, 'message.opened', { channel: 'email', linkId: payload.linkId, runId: payload.runId }, { dedupeKey: `signal:opened:${payload.linkId}` });
  },

  async [EVENT_TYPES.LEAD_OPTED_OUT]({ payload }) {
    await cancelForOptOut(payload.leadId, payload.channel);
  },

  async [EVENT_TYPES.WORKFLOW_LINK_CLICKED]({ payload, id }) {
    await enrollAll('trigger.link_clicked', payload.leadId, { eventId: id, data: payload, keySuffix: `link:${payload.linkId}`, excludeWorkflowId: null });
    await signal(payload.leadId, 'link.clicked', { linkId: payload.linkId, url: payload.url, runId: payload.runId }, { dedupeKey: `signal:link:${payload.linkId}` });
  },

  async [EVENT_TYPES.WORKFLOW_WEBHOOK_RECEIVED]({ payload }) {
    await signal(payload.leadId, 'webhook.received', payload.data || {}, { dedupeKey: `signal:webhook:${payload.workflowId}:${payload.eventId}` });
  },
};

let registered = false;
export function registerWorkflowEvents() {
  if (registered) return;
  registered = true;
  for (const [type, handler] of Object.entries(handlers)) {
    eventBus.subscribe(type, async (envelope) => {
      try { await handler(envelope); } catch (error) {
        logger.error('Workflow event handler failed', { module: 'workflow', eventType: type, error: error.message });
        throw error; // EventBus dead-letters it
      }
    });
  }
}

export const __test__ = { handlers };
