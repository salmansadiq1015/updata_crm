/**
 * Workflow Automation — shared constants and the node catalog.
 *
 * The catalog is the single source of truth for which node types exist, which output
 * ports they expose and which category they belong to. The graph validator, the runner
 * and the client palette (GET /workflows/catalog) all read it.
 */

export const WORKFLOW_QUEUE = 'workflow-automation';

export const WORKFLOW_STATUSES = Object.freeze(['draft', 'published', 'paused', 'archived']);

export const RUN_STATUSES = Object.freeze([
  'pending', 'queued', 'running', 'waiting', 'paused', 'completed', 'failed', 'cancelled', 'skipped',
]);
export const ACTIVE_RUN_STATUSES = Object.freeze(['pending', 'queued', 'running', 'waiting', 'paused']);
export const TERMINAL_RUN_STATUSES = Object.freeze(['completed', 'failed', 'cancelled', 'skipped']);

export const STEP_STATUSES = Object.freeze(['running', 'waiting', 'completed', 'failed', 'skipped']);

export const CAMPAIGN_STATUSES = Object.freeze(['draft', 'running', 'paused', 'stopped', 'completed']);

export const END_OUTCOMES = Object.freeze([
  'qualified', 'not_qualified', 'interested', 'not_interested', 'converted', 'unreachable', 'callback_scheduled',
  'follow_up_required', 'opted_out', 'completed', 'failed', 'stopped',
]);

/** End outcome → lead status written when the end node has `updateLeadStatus` on. */
export const END_OUTCOME_LEAD_STATUS = Object.freeze({
  qualified: 'qualified',
  not_qualified: 'unqualified',
  interested: null, // keeps the status; the outcome is recorded on the lead timeline
  not_interested: 'unqualified',
  converted: 'converted',
  unreachable: null,
  callback_scheduled: null,
  follow_up_required: null,
  opted_out: 'unqualified',
  completed: null,
  failed: null,
  stopped: null,
});

export const LEAD_STATUSES = Object.freeze(['new', 'contacted', 'qualified', 'unqualified', 'converted']);

/** Hard runtime limits (loop and runaway protection). */
export const LIMITS = Object.freeze({
  maxNodes: 150,
  maxEdges: 300,
  maxStepsPerRun: 200,
  maxStepsPerAdvance: 40,
  defaultMaxVisits: 5,
  maxMaxVisits: 20,
  leaseMs: 90_000,
  maxActionRetries: 3,
  maxCampaignLeads: 5000,
  maxScheduleEnrollments: 500,
  maxDelayDays: 90,
  maxWaitHours: 24 * 30,
});

// --------------------------------------------------------------------------- node catalog

/**
 * category: trigger | ai | communication | crm | logic (conditions) | timing | integration | end
 * outputs: output port ids (edge.sourceHandle). The runner follows the port the node
 *          returns; 'error' is an optional port any action may expose for failures.
 * sideEffect: performs an external or CRM write (idempotency key required; skipped in dry runs)
 */
export const NODE_CATALOG = Object.freeze({
  // Triggers -------------------------------------------------------------------------
  'trigger.manual': { category: 'trigger', outputs: ['out'], event: null },
  'trigger.lead_created': { category: 'trigger', outputs: ['out'], event: 'lead.created' },
  'trigger.leads_imported': { category: 'trigger', outputs: ['out'], event: 'lead.imported' },
  'trigger.lead_updated': { category: 'trigger', outputs: ['out'], event: 'lead.updated' },
  'trigger.call_completed': { category: 'trigger', outputs: ['out'], event: 'call.completed' },
  'trigger.inbound_call': { category: 'trigger', outputs: ['out'], event: 'inbound_call.completed' },
  'trigger.message_received': { category: 'trigger', outputs: ['out'], event: 'message.received' },
  'trigger.message_status': { category: 'trigger', outputs: ['out'], event: 'message.status' },
  'trigger.link_clicked': { category: 'trigger', outputs: ['out'], event: 'link.clicked' },
  'trigger.webhook': { category: 'trigger', outputs: ['out'], event: 'webhook.received' },
  'trigger.schedule': { category: 'trigger', outputs: ['out'], event: null },

  // AI ------------------------------------------------------------------------------
  'ai.call': { category: 'ai', outputs: ['answered', 'unanswered', 'failed', 'blocked'], sideEffect: true, waits: true },
  'ai.analyze': { category: 'ai', outputs: ['qualified', 'not_qualified', 'callback', 'unknown'], waits: true },
  'ai.callback': { category: 'ai', outputs: ['out', 'failed'], sideEffect: true, waits: true },

  // Communication ---------------------------------------------------------------------
  'msg.sms': { category: 'communication', outputs: ['sent', 'blocked', 'failed'], sideEffect: true, channel: 'sms' },
  'msg.whatsapp': { category: 'communication', outputs: ['sent', 'blocked', 'failed'], sideEffect: true, channel: 'whatsapp' },
  'msg.email': { category: 'communication', outputs: ['sent', 'blocked', 'failed'], sideEffect: true, channel: 'email' },
  'notify.user': { category: 'communication', outputs: ['out'], sideEffect: true },
  'task.create': { category: 'crm', outputs: ['out'], sideEffect: true },

  // CRM -------------------------------------------------------------------------------
  'crm.update_lead': { category: 'crm', outputs: ['out'], sideEffect: true },
  'crm.add_tags': { category: 'crm', outputs: ['out'], sideEffect: true },
  'crm.assign': { category: 'crm', outputs: ['out'], sideEffect: true },
  'crm.add_note': { category: 'crm', outputs: ['out'], sideEffect: true },
  'crm.qualification': { category: 'crm', outputs: ['out'], sideEffect: true },
  'crm.follow_up': { category: 'crm', outputs: ['out'], sideEffect: true },
  'crm.custom_fields': { category: 'crm', outputs: ['out'], sideEffect: true },

  // Integrations ----------------------------------------------------------------------
  'integration.webhook': { category: 'integration', outputs: ['out', 'failed'], sideEffect: true },

  // Logic -----------------------------------------------------------------------------
  'logic.condition': { category: 'logic', outputs: ['yes', 'no'] },
  'logic.delay': { category: 'timing', outputs: ['out'], waits: true },
  'logic.wait_event': { category: 'timing', outputs: ['matched', 'timeout'], waits: true },

  // End -------------------------------------------------------------------------------
  'end': { category: 'end', outputs: [] },
});

export const NODE_TYPES = Object.freeze(Object.keys(NODE_CATALOG));
export const TRIGGER_TYPES = Object.freeze(NODE_TYPES.filter((t) => NODE_CATALOG[t].category === 'trigger'));
/** Nodes that legitimately break a cycle (the run waits before revisiting). */
export const CYCLE_BREAKERS = Object.freeze(['logic.delay', 'logic.wait_event', 'ai.call', 'ai.callback']);

/** Events a logic.wait_event node can wait for. */
export const WAITABLE_EVENTS = Object.freeze([
  'message.replied', 'message.delivered', 'message.failed', 'message.opened', 'link.clicked',
  'call.completed', 'inbound_call.completed', 'lead.updated', 'webhook.received',
]);

/** Outcome filters for call triggers. */
export const CALL_OUTCOME_FILTERS = Object.freeze([
  'any', 'answered', 'unanswered', 'failed', 'qualified', 'not_qualified', 'callback_requested', 'do_not_contact',
]);

export const CONDITION_OPERATORS = Object.freeze([
  'equals', 'not_equals', 'contains', 'not_contains', 'in', 'not_in',
  'gt', 'gte', 'lt', 'lte', 'exists', 'not_exists', 'is_true', 'is_false',
  'before', 'after', 'within_last_hours', 'older_than_hours',
]);

/** Dispositions that mean a person was on the line (mirrors aiCalling REACHED_DISPOSITIONS). */
export const REACHED_DISPOSITIONS = Object.freeze([
  'unresponsive', 'answered_completed', 'answered_partial', 'interrupted', 'declined', 'callback_requested', 'do_not_contact',
]);
