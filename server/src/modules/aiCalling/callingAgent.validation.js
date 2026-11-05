import Joi from 'joi';
import { agentAvatarPresetIds } from './agentAvatarPresets.js';
import { objectId } from '../../shared/validation/commonSchemas.js';
import { question, statusRule, agentConfig, schedule } from './aiCalling.validation.js';
import { AGENT_TYPES, FOLLOW_UP_TRIGGERS } from './engine/agentTypes.js';
import { FOLLOW_UP_OUTCOMES } from './engine/followUpDecision.js';
import { MAX_ROUTING_RULES } from './engine/followUpRouting.js';

const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'unqualified', 'converted'];
export const followUpConfig = Joi.object({
  enabled: Joi.boolean(),
  autoCall: Joi.boolean(),
  manualCall: Joi.boolean(),
  triggers: Joi.array().items(Joi.string().valid(...FOLLOW_UP_TRIGGERS)).unique().max(FOLLOW_UP_TRIGGERS.length),
  objective: Joi.string().trim().max(1000).allow(''),
  instructions: Joi.string().trim().max(4000).allow(''),
  questions: Joi.array().items(question.fork(['label', 'text'], field => field.allow(''))).max(20),
  schedule,
  maxRounds: Joi.number().integer().min(1).max(10),
  minHoursBetweenRounds: Joi.number().integer().min(0).max(720),
  defaultCallbackDelayMinutes: Joi.number().integer().min(5).max(10080),
  unavailableRetryHours: Joi.number().integer().min(1).max(720),
  incompleteRetryHours: Joi.number().integer().min(1).max(720),
  informationRetryHours: Joi.number().integer().min(1).max(720),
  needsTimeRetryDays: Joi.number().integer().min(1).max(60),
  eligibleLeadStatuses: Joi.array().items(Joi.string().valid(...LEAD_STATUSES)).unique(),
  stopLeadStatuses: Joi.array().items(Joi.string().valid(...LEAD_STATUSES)).unique(),
  routes: Joi.object().pattern(Joi.string().valid(...FOLLOW_UP_OUTCOMES, 'QUALIFIED'), objectId.allow(null)),
  routingRules: Joi.array().max(MAX_ROUTING_RULES).items(Joi.object({
    id: Joi.string().trim().max(60).allow(''),
    name: Joi.string().trim().max(120).allow(''),
    enabled: Joi.boolean().default(true),
    agentId: objectId.required(),
    when: Joi.object({
      outcomes: Joi.array().items(Joi.string().valid(...FOLLOW_UP_OUTCOMES, 'QUALIFIED')).unique().max(20),
      leadSources: Joi.array().items(Joi.string().valid('extension', 'google_places', 'manual', 'widget', 'import', 'incoming_call')).unique(),
      leadStatuses: Joi.array().items(Joi.string().valid(...LEAD_STATUSES)).unique(),
      leadTypes: Joi.array().items(Joi.string().trim().max(40)).unique().max(10),
      languages: Joi.array().items(Joi.string().trim().max(20)).unique().max(30),
      countries: Joi.array().items(Joi.string().trim().uppercase().length(2)).unique().max(60),
      cities: Joi.array().items(Joi.string().trim().max(120)).unique().max(60),
      businessTypes: Joi.array().items(Joi.string().trim().max(120)).unique().max(30),
    }).default({}),
  })),
  escalation: Joi.object({
    userIds: Joi.array().items(objectId).unique().max(20),
    assignTo: Joi.string().valid('owner', 'first_recipient'),
    email: Joi.boolean(),
  }),
  escalateToUserId: objectId.allow(null),
});

const fields = {
  name: Joi.string().trim().max(120),
  title: Joi.string().trim().max(160).allow(''),
  description: Joi.string().trim().max(1000).allow(''),
  availability: Joi.string().valid('draft', 'active', 'paused', 'archived'),
  usage: Joi.string().valid('outbound', 'inbound', 'both'),
  agentType: Joi.string().valid(...AGENT_TYPES),
  followUp: followUpConfig,
  avatarPresetId: Joi.string().valid(...agentAvatarPresetIds).allow(null),
  avatarFileId: objectId.allow(null),
  agentConfig,
  questionnaire: Joi.object({ questions: Joi.array().items(question.fork(['label', 'text'], field => field.allow(''))).max(40).required() }),
  statusRules: Joi.array().items(statusRule).max(40),
  schedule,
  transport: Joi.string().valid('cloud_sip', 'paired_phone'),
  pairedDeviceId: objectId.allow(null),
  inbound: Joi.object({
    greeting: Joi.string().trim().max(500).allow(''),
    instructions: Joi.string().trim().max(4000).allow(''),
    escalationInstructions: Joi.string().trim().max(1000).allow(''),
    assignToUserId: objectId.allow(null),
    assignOverridesLeadOwner: Joi.boolean(),
    closingQuestions: Joi.array().items(Joi.object({
      key: Joi.string().trim().max(60).allow(''),
      label: Joi.string().trim().max(80).required(),
      question: Joi.string().trim().max(300).required(),
      type: Joi.string().valid('text', 'long_text', 'email', 'phone', 'address', 'number', 'date', 'time', 'choice', 'yes_no').default('text'),
      required: Joi.boolean().default(false),
      options: Joi.array().items(Joi.string().trim().max(60)).max(12).default([]),
    })).max(20),
    statusByResult: Joi.object().pattern(
      Joi.string().valid('QUALIFIED', 'PARTIALLY_QUALIFIED', 'CALLBACK_REQUIRED', 'SUPPORT_REQUIRED', 'INFORMATION_ONLY', 'NOT_QUALIFIED', 'UNRESOLVED', 'MISSED', 'HUMAN_HANDLED', 'INTERRUPTED'),
      Joi.string().valid('new', 'in_progress', 'follow_up', 'waiting_on_caller', 'resolved', 'closed', 'spam'),
    ),
  }),
};
export const agentId = { params: Joi.object({ id: objectId.required() }) };
export const createAgent = { body: Joi.object({ ...fields, name: fields.name.required(), assignedLeadIds: Joi.array().items(objectId).max(500) }) };
export const updateAgent = { ...agentId, body: Joi.object({ ...fields, version: Joi.number().integer().min(1).required() }).min(2) };
export const listAgents = { query: Joi.object({
  page: Joi.number().integer().min(1).default(1), limit: Joi.number().integer().min(1).max(100).default(24),
  search: Joi.string().trim().max(100).allow(''), availability: fields.availability,
  readiness: Joi.string().valid('ready', 'incomplete'),
  usage: Joi.string().valid('outbound', 'inbound'),
  campaignStatus: Joi.string().valid('active', 'none'),
  sort: Joi.string().valid('updated', 'active', 'name').default('updated'),
}) };
export const assignLeads = { ...agentId, body: Joi.object({
  leadIds: Joi.array().items(objectId).max(500).required(), mode: Joi.string().valid('replace', 'add').default('replace'), version: Joi.number().integer().min(1).required(),
}) };
export const imageId = { params: Joi.object({ id: objectId.required() }) };
export const listImages = { query: Joi.object({ page: Joi.number().integer().min(1).default(1), limit: Joi.number().integer().min(1).max(100).default(48) }) };
export const launchAgent = { ...agentId, body: Joi.object({
  transport: fields.transport,
  pairedDeviceId: objectId.allow(null),
  idempotencyKey: Joi.string().pattern(/^[a-zA-Z0-9_-]{16,100}$/).required(),
  name: Joi.string().trim().max(160),
  mode: Joi.string().valid('now', 'scheduled').required(),
  scheduledAt: Joi.date().iso().greater('now').when('mode', { is: 'scheduled', then: Joi.required(), otherwise: Joi.valid(null).optional() }),
  schedule,
  executionEndsAt: Joi.date().iso().greater('now').allow(null),
  continueAcrossDays: Joi.boolean().default(false),
}) };
export const callAnalytics = {
  params: Joi.object({ id: objectId.required() }),
  query: Joi.object({ from: Joi.date().iso(), to: Joi.date().iso().min(Joi.ref('from')) }),
};
