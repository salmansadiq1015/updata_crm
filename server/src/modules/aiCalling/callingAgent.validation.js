import Joi from 'joi';
import { agentAvatarPresetIds } from './agentAvatarPresets.js';
import { objectId } from '../../shared/validation/commonSchemas.js';
import { question, statusRule, agentConfig, schedule } from './aiCalling.validation.js';

const fields = {
  name: Joi.string().trim().max(120),
  title: Joi.string().trim().max(160).allow(''),
  description: Joi.string().trim().max(1000).allow(''),
  availability: Joi.string().valid('draft', 'active', 'paused', 'archived'),
  avatarPresetId: Joi.string().valid(...agentAvatarPresetIds).allow(null),
  avatarFileId: objectId.allow(null),
  agentConfig,
  questionnaire: Joi.object({ questions: Joi.array().items(question.fork(['label', 'text'], field => field.allow(''))).max(40).required() }),
  statusRules: Joi.array().items(statusRule).max(40),
  schedule,
  transport: Joi.string().valid('cloud_sip', 'paired_phone'),
  pairedDeviceId: objectId.allow(null),
};
export const agentId = { params: Joi.object({ id: objectId.required() }) };
export const createAgent = { body: Joi.object({ ...fields, name: fields.name.required(), assignedLeadIds: Joi.array().items(objectId).max(500) }) };
export const updateAgent = { ...agentId, body: Joi.object({ ...fields, version: Joi.number().integer().min(1).required() }).min(2) };
export const listAgents = { query: Joi.object({
  page: Joi.number().integer().min(1).default(1), limit: Joi.number().integer().min(1).max(100).default(24),
  search: Joi.string().trim().max(100).allow(''), availability: fields.availability,
  readiness: Joi.string().valid('ready', 'incomplete'),
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
