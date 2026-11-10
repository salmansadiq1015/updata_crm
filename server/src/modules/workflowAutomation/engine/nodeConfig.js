/**
 * Per-node configuration validation (pure). Returns i18n-friendly error codes:
 *   [{ nodeId, field, code }]  — the client renders `workflow.validation.<code>`.
 *
 * `normalizeConfig` fills defaults so the runner never has to guess.
 */
import {
  CALL_OUTCOME_FILTERS, CONDITION_OPERATORS, END_OUTCOMES, LEAD_STATUSES, LIMITS, WAITABLE_EVENTS,
} from '../workflow.constants.js';

const OBJECT_ID = /^[a-f0-9]{24}$/i;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const isId = (v) => typeof v === 'string' && OBJECT_ID.test(v);
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const num = (v, d) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));
const inRange = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;
const httpUrl = (v) => {
  try { const u = new URL(String(v)); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; }
};
const validDays = (days) => Array.isArray(days) && days.length > 0 && days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6);
export function isValidTimezone(tz) {
  try { new Intl.DateTimeFormat('en-GB', { timeZone: tz }); return Boolean(tz); } catch { return false; }
}

export const QUALIFICATION_FIELD_KEYS = Object.freeze([
  'need', 'current_solution', 'role', 'decision_authority', 'budget', 'timeline', 'interest',
  'objections', 'preferred_channel', 'callback_time', 'requested_info', 'next_action',
]);

/** Field paths a condition rule may read (prefix match for dynamic keys). */
export const CONDITION_FIELDS = Object.freeze([
  'lead.status', 'lead.pipelineStage', 'lead.tags', 'lead.source', 'lead.score', 'lead.scoreBand', 'lead.country', 'lead.city',
  'lead.hasPhone', 'lead.hasEmail', 'lead.assigned', 'lead.createdAt', 'lead.lastContactedAt', 'lead.qualification.', 'lead.customFields.',
  'call.outcome', 'call.disposition', 'call.qualification', 'call.reached', 'call.callbackRequested', 'call.answers.', 'call.durationSeconds', 'call.attempts',
  'analysis.qualification', 'analysis.interest', 'analysis.callbackRequested', 'analysis.objections', 'analysis.fields.',
  'message.status', 'message.channel', 'message.delivered', 'message.replied', 'message.opened',
  'link.clicked', 'consent.voice', 'consent.sms', 'consent.email', 'consent.whatsapp',
  'run.attempts.', 'run.visits', 'event.',
]);

export const CUSTOM_FIELD_KEY = /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/;

export function isConditionField(field) {
  const f = str(field);
  if (!f || f.length > 120 || !/^[a-zA-Z0-9_.]+$/.test(f)) return false;
  return CONDITION_FIELDS.some((allowed) => (allowed.endsWith('.') ? f.startsWith(allowed) && f.length > allowed.length : f === allowed));
}

const NO_VALUE_OPERATORS = new Set(['exists', 'not_exists', 'is_true', 'is_false']);

function validateConditionTree(node, errors, nodeId, path = 'rules', depth = 0) {
  if (depth > 4) { errors.push({ nodeId, field: path, code: 'condition_too_deep' }); return 0; }
  if (!node || typeof node !== 'object') { errors.push({ nodeId, field: path, code: 'condition_invalid' }); return 0; }
  if (!['and', 'or'].includes(node.op)) errors.push({ nodeId, field: `${path}.op`, code: 'condition_invalid' });
  const rules = Array.isArray(node.rules) ? node.rules : [];
  if (!rules.length) { errors.push({ nodeId, field: path, code: 'condition_empty' }); return 0; }
  if (rules.length > 25) errors.push({ nodeId, field: path, code: 'condition_too_many' });
  let count = 0;
  rules.forEach((rule, i) => {
    const p = `${path}.${i}`;
    if (rule && Array.isArray(rule.rules)) { count += validateConditionTree(rule, errors, nodeId, `${p}.rules`, depth + 1); return; }
    count += 1;
    if (!isConditionField(rule?.field)) errors.push({ nodeId, field: `${p}.field`, code: 'condition_field_invalid' });
    if (!CONDITION_OPERATORS.includes(rule?.operator)) errors.push({ nodeId, field: `${p}.operator`, code: 'condition_operator_invalid' });
    else if (!NO_VALUE_OPERATORS.has(rule.operator) && (rule.value === undefined || rule.value === null || rule.value === '')) {
      errors.push({ nodeId, field: `${p}.value`, code: 'condition_value_required' });
    }
  });
  return count;
}

const MESSAGE_PURPOSES = ['transactional', 'promotional', 'support'];

const VALIDATORS = {
  'trigger.manual': () => {},
  'trigger.leads_imported': () => {},
  'trigger.lead_created': () => {},
  'trigger.lead_updated': (c, e) => {
    if (c.toStatus && !LEAD_STATUSES.includes(c.toStatus)) e('toStatus', 'invalid_option');
    if (c.fields && (!Array.isArray(c.fields) || c.fields.length > 20)) e('fields', 'invalid_option');
  },
  'trigger.call_completed': (c, e) => {
    if (!CALL_OUTCOME_FILTERS.includes(c.outcome)) e('outcome', 'invalid_option');
    if (c.agentId && !isId(c.agentId)) e('agentId', 'invalid_reference');
  },
  'trigger.inbound_call': (c, e) => { if (!['any', 'handled', 'missed', 'qualified'].includes(c.outcome)) e('outcome', 'invalid_option'); },
  'trigger.message_received': (c, e) => {
    if (!['any', 'sms', 'whatsapp', 'email'].includes(c.channel)) e('channel', 'invalid_option');
    if (c.keyword && str(c.keyword).length > 60) e('keyword', 'too_long');
  },
  'trigger.message_status': (c, e) => {
    if (!['any', 'sms', 'whatsapp', 'email'].includes(c.channel)) e('channel', 'invalid_option');
    if (!['delivered', 'read', 'failed', 'opened'].includes(c.status)) e('status', 'invalid_option');
  },
  'trigger.link_clicked': () => {},
  'trigger.webhook': (c, e) => { if (!/^[A-Za-z0-9_-]{24,64}$/.test(str(c.token))) e('token', 'required'); },
  'trigger.schedule': (c, e) => {
    if (!HHMM.test(str(c.time))) e('time', 'invalid_time');
    if (!validDays(c.days)) e('days', 'required');
    if (!isValidTimezone(c.timezone)) e('timezone', 'invalid_timezone');
    if (!inRange(c.limit, 1, LIMITS.maxScheduleEnrollments)) e('limit', 'out_of_range');
    const seg = c.segment || {};
    if (!(seg.statuses?.length || seg.tags?.length || seg.sources?.length)) e('segment', 'segment_required');
    if (seg.statuses?.some((s) => !LEAD_STATUSES.includes(s))) e('segment', 'invalid_option');
  },

  'ai.call': (c, e) => {
    if (!isId(c.agentId)) e('agentId', 'required');
    if (!inRange(c.maxAttempts, 1, 10)) e('maxAttempts', 'out_of_range');
    if (!inRange(c.retryDelayMinutes, 5, 7 * 24 * 60)) e('retryDelayMinutes', 'out_of_range');
    if (!inRange(c.timeoutHours, 1, LIMITS.maxWaitHours)) e('timeoutHours', 'out_of_range');
  },
  'ai.analyze': (c, e) => { if (!inRange(c.waitForIntelligenceMinutes, 0, 60)) e('waitForIntelligenceMinutes', 'out_of_range'); },
  'ai.callback': (c, e) => {
    if (c.agentId && !isId(c.agentId)) e('agentId', 'invalid_reference');
    if (!inRange(c.delayMinutes, 5, 30 * 24 * 60)) e('delayMinutes', 'out_of_range');
    if (c.waitForCompletion && !inRange(c.timeoutHours, 1, LIMITS.maxWaitHours)) e('timeoutHours', 'out_of_range');
  },

  'msg.sms': (c, e) => {
    if (!c.templateId && !str(c.body)) e('body', 'required');
    if (str(c.body).length > 1600) e('body', 'too_long');
    if (c.templateId && !isId(c.templateId)) e('templateId', 'invalid_reference');
    if (!MESSAGE_PURPOSES.includes(c.purpose)) e('purpose', 'invalid_option');
    if (c.trackedLinkUrl && !httpUrl(c.trackedLinkUrl)) e('trackedLinkUrl', 'invalid_url');
    if (/\{\{\s*link\s*\}\}/.test(str(c.body)) && !c.trackedLinkUrl) e('trackedLinkUrl', 'tracked_link_required');
  },
  'msg.whatsapp': (c, e) => {
    if (!isId(c.templateId)) e('templateId', 'whatsapp_template_required');
    if (!MESSAGE_PURPOSES.includes(c.purpose)) e('purpose', 'invalid_option');
    if (c.trackedLinkUrl && !httpUrl(c.trackedLinkUrl)) e('trackedLinkUrl', 'invalid_url');
  },
  'msg.email': (c, e) => {
    if (!c.templateId && !str(c.subject)) e('subject', 'required');
    if (!c.templateId && !str(c.body)) e('body', 'required');
    if (str(c.body).length > 20000) e('body', 'too_long');
    if (c.templateId && !isId(c.templateId)) e('templateId', 'invalid_reference');
    if (!MESSAGE_PURPOSES.includes(c.purpose)) e('purpose', 'invalid_option');
    if (c.trackedLinkUrl && !httpUrl(c.trackedLinkUrl)) e('trackedLinkUrl', 'invalid_url');
    if (/\{\{\s*link\s*\}\}/.test(`${str(c.subject)} ${str(c.body)}`) && !c.trackedLinkUrl) e('trackedLinkUrl', 'tracked_link_required');
  },
  'notify.user': (c, e) => {
    if (!['assigned', 'owner', 'users'].includes(c.recipients)) e('recipients', 'invalid_option');
    if (c.recipients === 'users' && !(Array.isArray(c.userIds) && c.userIds.length && c.userIds.every(isId))) e('userIds', 'required');
    if (!str(c.title)) e('title', 'required');
    if (!str(c.message)) e('message', 'required');
    if (!['LOW', 'NORMAL', 'HIGH', 'CRITICAL'].includes(c.priority)) e('priority', 'invalid_option');
  },
  'task.create': (c, e) => {
    if (!str(c.title)) e('title', 'required');
    if (!['assigned', 'owner', 'user'].includes(c.assignee)) e('assignee', 'invalid_option');
    if (c.assignee === 'user' && !isId(c.userId)) e('userId', 'required');
    if (!inRange(c.dueInHours, 0, 24 * 90)) e('dueInHours', 'out_of_range');
    if (!['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(c.priority)) e('priority', 'invalid_option');
  },
  'crm.update_lead': (c, e) => {
    if (!c.status && !c.pipelineStage) e('status', 'required');
    if (c.status && !LEAD_STATUSES.includes(c.status)) e('status', 'invalid_option');
    if (c.pipelineStage && !['LEAD', 'FOLLOW_UP'].includes(c.pipelineStage)) e('pipelineStage', 'invalid_option');
  },
  'crm.add_tags': (c, e) => {
    const add = Array.isArray(c.add) ? c.add : []; const remove = Array.isArray(c.remove) ? c.remove : [];
    if (!add.length && !remove.length) e('add', 'required');
    if ([...add, ...remove].some((t) => !str(t) || str(t).length > 50)) e('add', 'invalid_option');
  },
  'crm.assign': (c, e) => { if (!isId(c.userId)) e('userId', 'required'); },
  'crm.add_note': (c, e) => {
    if (!str(c.text)) e('text', 'required');
    if (str(c.text).length > 1000) e('text', 'too_long');
  },
  'crm.qualification': (c, e) => {
    if (!QUALIFICATION_FIELD_KEYS.includes(c.fieldKey)) e('fieldKey', 'invalid_option');
    if (!str(c.value)) e('value', 'required');
  },

  'crm.follow_up': (c, e) => {
    if (!inRange(c.dueInHours, 0, 24 * 90)) e('dueInHours', 'out_of_range');
    if (!['phone', 'sms', 'email', 'whatsapp', 'in_person', 'other'].includes(c.channel)) e('channel', 'invalid_option');
    if (!['assigned', 'owner', 'user'].includes(c.assignee)) e('assignee', 'invalid_option');
    if (c.assignee === 'user' && !isId(c.userId)) e('userId', 'required');
    if (str(c.note).length > 2000) e('note', 'too_long');
  },
  'crm.custom_fields': (c, e) => {
    const set = Array.isArray(c.set) ? c.set : []; const remove = Array.isArray(c.remove) ? c.remove : [];
    if (!set.length && !remove.length) e('set', 'required');
    if (set.length + remove.length > 25) e('set', 'too_many');
    if (set.some((f) => !CUSTOM_FIELD_KEY.test(str(f?.key)))) e('set', 'invalid_key');
    if (set.some((f) => str(f?.value).length > 500)) e('set', 'too_long');
    if (remove.some((k) => !CUSTOM_FIELD_KEY.test(str(k)))) e('remove', 'invalid_key');
  },
  'integration.webhook': (c, e) => {
    let url = null; try { url = new URL(str(c.url)); } catch { /* invalid */ }
    if (!url) e('url', 'required');
    else if (url.protocol !== 'https:') e('url', 'https_required');
    if (!inRange(c.timeoutSeconds, 1, 30)) e('timeoutSeconds', 'out_of_range');
  },
  'logic.condition': (c, e, nodeId, errors) => { validateConditionTree(c.rules, errors, nodeId, 'rules'); },
  'logic.delay': (c, e) => {
    if (!['duration', 'until', 'next_business_day', 'time_of_day'].includes(c.mode)) { e('mode', 'invalid_option'); return; }
    if (c.mode === 'duration') {
      if (!['minutes', 'hours', 'days'].includes(c.unit)) e('unit', 'invalid_option');
      const minutes = c.amount * ({ minutes: 1, hours: 60, days: 1440 }[c.unit] || 0);
      if (!(c.amount > 0) || minutes > LIMITS.maxDelayDays * 1440) e('amount', 'out_of_range');
    }
    if (c.mode === 'until' && Number.isNaN(new Date(c.until).getTime())) e('until', 'invalid_date');
    if (['time_of_day', 'next_business_day'].includes(c.mode) && !HHMM.test(str(c.time))) e('time', 'invalid_time');
    if (c.timezoneMode === 'fixed' && !isValidTimezone(c.timezone)) e('timezone', 'invalid_timezone');
    if (c.businessHours?.enabled) {
      if (!HHMM.test(str(c.businessHours.start)) || !HHMM.test(str(c.businessHours.end))) e('businessHours', 'invalid_time');
      if (!validDays(c.businessHours.days)) e('businessHours', 'required');
    }
  },
  'logic.wait_event': (c, e) => {
    if (!Array.isArray(c.events) || !c.events.length || c.events.some((ev) => !WAITABLE_EVENTS.includes(ev))) e('events', 'required');
    if (!inRange(c.timeoutHours, 1, LIMITS.maxWaitHours)) e('timeoutHours', 'out_of_range');
  },
  end: (c, e) => { if (!END_OUTCOMES.includes(c.outcome)) e('outcome', 'invalid_option'); },
};

const DEFAULTS = {
  'trigger.call_completed': { outcome: 'any', agentId: null },
  'trigger.inbound_call': { outcome: 'any' },
  'trigger.message_received': { channel: 'any', keyword: '' },
  'trigger.message_status': { channel: 'any', status: 'delivered' },
  'trigger.lead_updated': { fields: [], toStatus: null },
  'trigger.schedule': { time: '09:00', days: [1, 2, 3, 4, 5], timezone: 'Europe/Zurich', limit: 100, segment: { statuses: [], tags: [], sources: [] } },
  'ai.call': { agentId: null, maxAttempts: 2, retryDelayMinutes: 60, timeoutHours: 72 },
  'ai.analyze': { waitForIntelligenceMinutes: 10 },
  'ai.callback': { agentId: null, delayMinutes: 120, useRequestedTime: true, note: '', waitForCompletion: false, timeoutHours: 72 },
  'msg.sms': { templateId: null, body: '', purpose: 'promotional', trackedLinkUrl: '' },
  'msg.whatsapp': { templateId: null, purpose: 'promotional', trackedLinkUrl: '' },
  'msg.email': { templateId: null, subject: '', body: '', purpose: 'promotional', trackedLinkUrl: '', trackOpens: true },
  'notify.user': { recipients: 'assigned', userIds: [], title: '', message: '', priority: 'NORMAL' },
  'task.create': { title: '', description: '', assignee: 'assigned', userId: null, dueInHours: 24, priority: 'MEDIUM' },
  'crm.update_lead': { status: null, pipelineStage: null },
  'crm.add_tags': { add: [], remove: [] },
  'crm.assign': { userId: null },
  'crm.add_note': { text: '' },
  'crm.qualification': { fieldKey: 'interest', value: '' },
  'crm.follow_up': { dueInHours: 24, channel: 'phone', assignee: 'assigned', userId: null, note: '' },
  'crm.custom_fields': { set: [], remove: [] },
  'integration.webhook': { url: '', includeLead: true, timeoutSeconds: 10 },
  'logic.condition': { rules: { op: 'and', rules: [] } },
  'logic.delay': { mode: 'duration', amount: 1, unit: 'days', until: null, time: '09:00', timezoneMode: 'lead', timezone: 'Europe/Zurich', businessHours: { enabled: false, start: '08:00', end: '18:00', days: [1, 2, 3, 4, 5] } },
  'logic.wait_event': { events: ['message.replied'], timeoutHours: 48 },
  end: { outcome: 'completed', updateLeadStatus: true, note: '' },
};

const NUMERIC = {
  'trigger.schedule': ['limit'],
  'ai.call': ['maxAttempts', 'retryDelayMinutes', 'timeoutHours'],
  'ai.analyze': ['waitForIntelligenceMinutes'],
  'ai.callback': ['delayMinutes', 'timeoutHours'],
  'task.create': ['dueInHours'],
  'crm.follow_up': ['dueInHours'],
  'integration.webhook': ['timeoutSeconds'],
  'logic.delay': ['amount'],
  'logic.wait_event': ['timeoutHours'],
};

export function normalizeConfig(type, config = {}) {
  const base = DEFAULTS[type] || {};
  const merged = { ...base, ...(config && typeof config === 'object' ? config : {}) };
  for (const key of NUMERIC[type] || []) merged[key] = num(merged[key], base[key]);
  if (type === 'logic.delay') merged.businessHours = { ...base.businessHours, ...(config?.businessHours || {}) };
  if (type === 'trigger.schedule') merged.segment = { ...base.segment, ...(config?.segment || {}) };
  return merged;
}

export function validateNodeConfig(nodeId, type, config) {
  const errors = [];
  const validator = VALIDATORS[type];
  if (!validator) return errors;
  const normalized = normalizeConfig(type, config);
  if (config?.maxVisits !== undefined && config?.maxVisits !== null && !inRange(Number(config.maxVisits), 1, LIMITS.maxMaxVisits)) {
    errors.push({ nodeId, field: 'maxVisits', code: 'out_of_range' });
  }
  validator(normalized, (field, code) => errors.push({ nodeId, field, code }), nodeId, errors);
  return errors;
}
