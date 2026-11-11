import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';
import { CALL_STATUSES, OUTCOMES } from './engine/stateMachine.js';
import { INQUIRY_CATEGORIES } from './engine/intents.js';
import { QUALIFICATION_RESULTS } from './engine/qualification.js';
import { RULE_ACTIONS, CALLER_TYPES } from './engine/ruleEngine.js';
import { RECOMMENDATION_ACTIONS } from './engine/recommendations.js';
import { GATEWAY_EVENT_TYPES } from './inboundCall.service.js';

const id = { params: Joi.object({ id: objectId.required() }) };
const csvOf = (values) => Joi.string().custom((v, h) => (String(v).split(',').every((x) => values.includes(x)) ? v : h.error('any.only')));
const hhmm = Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/);

const listFilters = {
  search: Joi.string().trim().max(80).allow(''),
  status: csvOf(CALL_STATUSES),
  handledBy: Joi.string().valid('ai', 'human', 'none'),
  callerType: Joi.string().valid('new', 'existing', 'private', 'ambiguous'),
  simSlot: Joi.number().integer().min(0).max(4),
  deviceId: objectId, agentId: objectId, leadId: objectId,
  outcome: csvOf(OUTCOMES),
  qualification: csvOf(QUALIFICATION_RESULTS),
  inquiry: Joi.string().valid(...INQUIRY_CATEGORIES),
  leadCreated: Joi.boolean(),
  workStatus: Joi.string().pattern(/^(open|(new|in_progress|follow_up|waiting_on_caller|resolved|closed|spam)(,(new|in_progress|follow_up|waiting_on_caller|resolved|closed|spam))*)$/),
  assignedTo: Joi.alternatives(objectId, Joi.string().valid('me', 'none')),
  ids: Joi.string().pattern(/^[a-f0-9]{24}(,[a-f0-9]{24}){0,499}$/),
  from: Joi.date().iso(), to: Joi.date().iso(),
  // An unknown zone made the analytics aggregation throw (500); reject it as a 400 instead
  // and pass on the canonical IANA spelling (e.g. 'utc' → 'UTC').
  tz: Joi.string().max(80).custom((v, h) => { try { return new Intl.DateTimeFormat('en-US', { timeZone: v }).resolvedOptions().timeZone; } catch { return h.error('any.invalid'); } }),
};

export const list = { query: Joi.object({ ...listFilters, page: Joi.number().integer().min(1).default(1), limit: Joi.number().integer().min(1).max(100).default(25), sort: Joi.string().valid('newest', 'oldest', 'longest').default('newest') }) };
export const filters = { query: Joi.object(listFilters) };
export const callId = id;
export const costs = { query: Joi.object({ from: Joi.date().iso(), to: Joi.date().iso(), agentId: objectId }) };
export const note = { ...id, body: Joi.object({ text: Joi.string().trim().min(1).max(2000).required() }) };
export const reviewField = { params: Joi.object({ id: objectId.required(), fieldId: objectId.required() }), body: Joi.object({ action: Joi.string().valid('confirm', 'correct', 'reject').required(), value: Joi.string().trim().max(1000).allow('', null) }) };
export const resolveMatch = { ...id, body: Joi.object({ leadId: objectId.required() }) };
export const recommendation = {
  params: Joi.object({ id: objectId.required(), recId: Joi.string().valid(...RECOMMENDATION_ACTIONS).required() }),
  body: Joi.object({ decision: Joi.string().valid('execute', 'dismiss').required(), dueAt: Joi.date().iso().allow(null), note: Joi.string().max(2000).allow('', null), leadId: objectId.allow(null), createLead: Joi.boolean().default(false) }),
};
export const followUp = { ...id, body: Joi.object({ dueAt: Joi.date().iso().required(), note: Joi.string().max(2000).allow('', null), action: Joi.string().valid(...RECOMMENDATION_ACTIONS).default('ARRANGE_CALLBACK'), leadId: objectId.allow(null), createLead: Joi.boolean().default(false) }) };
export const work = { ...id, body: Joi.object({ status: Joi.string().valid('new', 'in_progress', 'follow_up', 'waiting_on_caller', 'resolved', 'closed', 'spam'), assignedTo: objectId.allow(null), note: Joi.string().trim().max(1000).allow('', null) }).min(1) };
export const createLead = { ...id, body: Joi.object({ force: Joi.boolean().default(false) }).default({}) };
export const reportSims = { params: Joi.object({ id: objectId.required() }), body: Joi.object({
  sims: Joi.array().items(Joi.object({ slot: Joi.number().integer().min(0).max(4).required(), label: Joi.string().trim().max(80).allow(''), carrier: Joi.string().trim().max(80).allow('') })).max(4).required(),
}) };
export const agentTest = { params: Joi.object({ agentId: objectId.required() }) };
export const control = { params: Joi.object({ id: objectId.required(), kind: Joi.string().valid('answer', 'reject', 'takeover', 'hangup').required() }) };

const ruleBody = Joi.object({
  id: Joi.string().max(60),
  name: Joi.string().trim().min(1).max(120).required(),
  enabled: Joi.boolean().default(true),
  priority: Joi.number().integer().min(0).max(1000).default(100),
  conditions: Joi.object({
    callerType: Joi.string().valid(...CALLER_TYPES).default('any'),
    numbers: Joi.array().items(Joi.string().max(40)).max(200).default([]),
    numberPrefixes: Joi.array().items(Joi.string().max(16)).max(50).default([]),
    deviceIds: Joi.array().items(objectId).max(20).default([]),
    simSlots: Joi.array().items(Joi.number().integer().min(0).max(4)).max(5).default([]),
    withinBusinessHours: Joi.boolean().allow(null).default(null),
    leadStatuses: Joi.array().items(Joi.string().valid('new', 'contacted', 'qualified', 'unqualified', 'converted')).max(5).default([]),
  }).default({}),
  action: Joi.string().valid(...RULE_ACTIONS).required(),
  agentId: objectId.allow(null),
});
export const saveRule = { body: ruleBody };
export const ruleId = { params: Joi.object({ ruleId: Joi.string().max(60).required() }) };
export const testRules = { body: Joi.object({ number: Joi.string().max(40).allow('').default(''), deviceId: objectId.allow(null), simSlot: Joi.number().integer().min(0).max(4).allow(null), at: Joi.date().iso().allow(null) }) };

export const settings = { body: Joi.object({
  version: Joi.number().integer().min(1),
  enabled: Joi.boolean(),
  organizationName: Joi.string().trim().max(200).allow(''),
  defaultRegion: Joi.string().trim().length(2).uppercase(),
  defaultAgentId: objectId.allow(null),
  deviceAgents: Joi.array().items(Joi.object({ deviceId: objectId.required(), simSlot: Joi.number().integer().min(0).max(4).allow(null).default(null), agentId: objectId.allow(null).default(null), aiEnabled: Joi.boolean().default(true) })).max(40),
  answerDelaySeconds: Joi.number().integer().min(0).max(30),
  ringTimeoutSeconds: Joi.number().integer().min(15).max(120),
  maxConcurrentAiSessions: Joi.number().integer().min(1).max(10),
  fallbackAction: Joi.string().valid('human', 'ignore'),
  businessHours: Joi.object({ enabled: Joi.boolean(), timezone: Joi.string().max(80), days: Joi.array().items(Joi.number().integer().min(0).max(6)).max(7), start: hhmm, end: hhmm }),
  outsideHoursAction: Joi.string().valid(...RULE_ACTIONS),
  blockedNumbers: Joi.array().items(Joi.string().max(40)).max(500),
  blockedAction: Joi.string().valid('human', 'ignore'),
  leadCreation: Joi.string().valid('ai_answered', 'all_identified', 'never'),
  qualification: Joi.object({ required: Joi.array().items(Joi.string().max(60)).min(1).max(10), anyOf: Joi.array().items(Joi.string().max(60)).max(10), promoteLeadStatus: Joi.boolean() }),
  automation: Joi.object({
    createFollowUps: Joi.boolean(), followUpFor: Joi.array().items(Joi.string().valid(...QUALIFICATION_RESULTS)).max(7), returnMissedCalls: Joi.boolean(),
    notifyMissed: Joi.boolean(), notifyHandoff: Joi.boolean(), notifyQualified: Joi.boolean(), autoSendSms: Joi.boolean(), autoSendEmail: Joi.boolean(),
  }),
  handoffWaitSeconds: Joi.number().integer().min(10).max(120),
  aiDisclosure: Joi.boolean(),
  transcriptRetentionDays: Joi.number().integer().min(1).max(3650),
}).min(1) };

// ---- gateway (device token) ----
export const ring = { body: Joi.object({
  sessionId: Joi.string().pattern(/^[A-Za-z0-9_-]{8,80}$/).required(),
  number: Joi.string().max(40).allow('', null).default(''),
  simSlot: Joi.number().integer().min(0).max(4).allow(null).default(null),
  at: Joi.date().iso(),
  waiting: Joi.boolean().default(false),
}) };
const gwCallId = Joi.string().pattern(/^in_[a-f0-9]{24}$/).required();
export const gatewayEvent = {
  params: Joi.object({ callId: gwCallId }),
  body: Joi.object({
    eventId: Joi.string().pattern(/^[A-Za-z0-9_-]{8,80}$/).required(),
    type: Joi.string().valid(...GATEWAY_EVENT_TYPES).required(),
    at: Joi.date().iso(),
    data: Joi.object({
      reason: Joi.string().max(60), code: Joi.string().max(60), detail: Joi.string().max(300), codec: Joi.string().max(10), type: Joi.string().valid('takeover', 'hangup', 'reject', 'answer'),
      rxLevelDbfs: Joi.number(), txLevelDbfs: Joi.number(), upFrames: Joi.number(), downFrames: Joi.number(), upSeqGaps: Joi.number(),
      downUnderruns: Joi.number(), downOverruns: Joi.number(), firstAiAudioMs: Joi.number(), agentConnected: Joi.boolean(),
    }).default({}),
  }),
};
export const gatewayCall = { params: Joi.object({ callId: gwCallId }) };

// ---- voice agent (call token) ----
const agentParams = Joi.object({ callId: gwCallId });
export const agentOnly = { params: agentParams };
export const agentInfo = { params: agentParams, body: Joi.object({ fields: Joi.array().items(Joi.object({
  key: Joi.string().max(60).required(), value: Joi.alternatives(Joi.string().max(1000).allow(''), Joi.number()).default(''), explicit: Joi.boolean().default(true), declined: Joi.boolean().default(false),
  confidence: Joi.number().min(0).max(1), evidence: Joi.string().max(1000).allow(''), askedQuestion: Joi.string().max(500).allow(''),
})).min(1).max(20).required() }) };
export const agentQuestion = { params: agentParams, body: Joi.object({
  text: Joi.string().trim().min(1).max(1000).required(), category: Joi.string().max(40).allow(null, ''),
  answerStatus: Joi.string().valid('answered', 'partially_answered', 'unanswered', 'deferred').default('answered'),
  answerSummary: Joi.string().max(1000).allow(null, ''), requestId: Joi.string().max(80).allow(null),
}) };
export const agentIntent = { params: agentParams, body: Joi.object({ primary: Joi.string().max(40).required(), secondary: Joi.array().items(Joi.string().max(40)).max(6).default([]) }) };
export const agentCallback = { params: agentParams, body: Joi.object({ when: Joi.string().max(300).allow(null, ''), note: Joi.string().max(1000).allow(null, ''), human: Joi.boolean() }) };
export const agentHuman = { params: agentParams, body: Joi.object({ reason: Joi.string().max(500).allow(''), summary: Joi.string().max(2000).allow('') }) };
export const agentTranscript = { params: agentParams, body: Joi.object({
  role: Joi.string().valid('assistant', 'customer', 'caller').required(), text: Joi.string().max(4000).required(), itemId: Joi.string().max(120).required(),
  interrupted: Joi.boolean().default(false), at: Joi.date().iso(),
}) };
export const agentActivity = { params: agentParams, body: Joi.object({ agentState: Joi.string().max(20).allow(null), speaker: Joi.string().valid('assistant', 'customer', null).allow(null) }) };
export const agentLanguage = { params: agentParams, body: Joi.object({
  language: Joi.string().max(12).required(), explicit: Joi.boolean().default(false), confidence: Joi.number().min(0).max(1), evidence: Joi.string().max(1000).allow(''),
  source: Joi.string().max(20), turnId: Joi.string().max(120), requestId: Joi.string().max(120),
}).unknown(true) };
export const agentLoose = { params: agentParams, body: Joi.object().unknown(true) };
