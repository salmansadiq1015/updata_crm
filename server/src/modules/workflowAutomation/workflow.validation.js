import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';
import { CAMPAIGN_STATUSES, LIMITS, RUN_STATUSES, WORKFLOW_STATUSES } from './workflow.constants.js';
import { TEMPLATE_KEYS } from './workflow.templates.js';

const page = Joi.number().integer().min(1).max(10_000).default(1);
const limit = Joi.number().integer().min(1).max(100).default(25);
const idParams = Joi.object({ id: objectId.required() });

// Node configs are validated per node type by engine/nodeConfig.js at validate/publish time.
const graph = Joi.object({
  nodes: Joi.array().max(LIMITS.maxNodes).items(Joi.object({
    id: Joi.string().pattern(/^[A-Za-z0-9_-]{1,64}$/).required(),
    type: Joi.string().max(40).required(),
    position: Joi.object({ x: Joi.number().required(), y: Joi.number().required() }).unknown(true).required(),
    data: Joi.object({ label: Joi.string().allow('').max(120), config: Joi.object().unknown(true).default({}) }).unknown(true).default({}),
  }).unknown(true)).required(),
  edges: Joi.array().max(LIMITS.maxEdges).items(Joi.object({
    id: Joi.string().pattern(/^[A-Za-z0-9_-]{1,64}$/).required(),
    source: Joi.string().max(64).required(),
    target: Joi.string().max(64).required(),
    sourceHandle: Joi.string().max(40).allow(null).default('out'),
  }).unknown(true)).required(),
});

const settings = Joi.object({
  reentry: Joi.string().valid('never', 'after_completion', 'always'),
  stopOnOptOut: Joi.boolean(),
});

export const list = { query: Joi.object({
  page, limit, search: Joi.string().allow('').max(80), status: Joi.string().valid(...WORKFLOW_STATUSES),
  sortBy: Joi.string().valid('updatedAt', 'createdAt', 'name', 'publishedAt').default('updatedAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'), templates: Joi.boolean().default(false),
}) };
export const byId = { params: idParams };
export const create = { body: Joi.object({
  name: Joi.string().trim().min(1).max(160).required(), description: Joi.string().allow('').max(2000),
  templateKey: Joi.string().valid(...TEMPLATE_KEYS), fromWorkflowId: objectId, graph, settings,
}).oxor('templateKey', 'fromWorkflowId', 'graph') };
export const update = { params: idParams, body: Joi.object({
  name: Joi.string().trim().min(1).max(160), description: Joi.string().allow('').max(2000), graph,
  baseRevision: Joi.number().integer().min(0), settings, isTemplate: Joi.boolean(),
}).min(1) };
export const validateGraph = { params: idParams, body: Joi.object({ graph }) };
export const publish = { params: idParams, body: Joi.object({ notes: Joi.string().allow('').max(500).default('') }) };
export const setStatus = { params: idParams, body: Joi.object({ status: Joi.string().valid('published', 'paused', 'archived').required() }) };
export const version = { params: Joi.object({ id: objectId.required(), version: Joi.number().integer().min(1).required() }) };
export const analyze = { params: idParams, body: Joi.object({ leadId: objectId.allow(null), graph }) };

export const test = { params: idParams, body: Joi.object({
  leadId: objectId.required(), graph,
  options: Joi.object({
    callOutcome: Joi.string().valid('answered', 'unanswered', 'failed', 'blocked'),
    attempts: Joi.object().pattern(/^[A-Za-z0-9_-]{1,64}$/, Joi.array().items(Joi.string().valid('answered', 'unanswered', 'failed', 'blocked')).max(20)),
    analysis: Joi.string().valid('qualified', 'not_qualified', 'callback', 'unknown'),
    messageOutcome: Joi.string().valid('sent', 'blocked', 'failed'),
    eventOutcome: Joi.string().valid('matched', 'timeout'),
    event: Joi.object().unknown(true),
    values: Joi.object().unknown(true),
    startNodeId: Joi.string().pattern(/^[A-Za-z0-9_-]{1,64}$/),
    singleStep: Joi.boolean(),
  }).default({}),
}) };

const selection = Joi.object({
  mode: Joi.string().valid('explicit', 'filters').required(),
  leadIds: Joi.when('mode', { is: 'explicit', then: Joi.array().items(objectId).min(1).max(LIMITS.maxCampaignLeads).required(), otherwise: Joi.forbidden() }),
  filters: Joi.when('mode', { is: 'filters', then: Joi.object({
    statuses: Joi.array().items(Joi.string().max(30)).max(10).default([]),
    tags: Joi.array().items(Joi.string().max(50)).max(20).default([]),
    sources: Joi.array().items(Joi.string().max(40)).max(10).default([]),
  }).required(), otherwise: Joi.forbidden() }),
});
export const listCampaigns = { query: Joi.object({ page, limit, workflowId: objectId, status: Joi.string().valid(...CAMPAIGN_STATUSES) }) };
export const createCampaign = { body: Joi.object({
  name: Joi.string().trim().min(1).max(160).required(), description: Joi.string().allow('').max(1000),
  workflowId: objectId.required(), selection: selection.required(),
}) };
export const previewCampaign = { body: Joi.object({ selection: selection.required() }) };

export const listRuns = { query: Joi.object({
  page, limit, workflowId: objectId, campaignId: objectId, leadId: objectId, status: Joi.string().valid(...RUN_STATUSES, 'active'),
}) };
export const controlRun = { params: Joi.object({ id: objectId.required(), action: Joi.string().valid('pause', 'resume', 'stop', 'retry', 'skip').required() }), body: Joi.object({ port: Joi.string().max(40).allow(null) }) };
export const listEvents = { query: Joi.object({
  page, limit: Joi.number().integer().min(1).max(200).default(50), workflowId: objectId, leadId: objectId, runId: objectId,
  type: Joi.string().max(80).pattern(/^[a-z_.*]+$/), from: Joi.date().iso(), to: Joi.date().iso(),
}) };
export const analytics = { query: Joi.object({ days: Joi.number().integer().valid(7, 14, 30, 90).default(30), workflowId: objectId }) };
export const leadParam = { params: Joi.object({ leadId: objectId.required() }) };

export const copilot = { params: idParams, body: Joi.object({
  messages: Joi.array().min(1).max(40).items(Joi.object({ role: Joi.string().valid('user', 'assistant').required(), content: Joi.string().allow('').max(4000).required() })).required(),
  graph,
  selectedNodeId: Joi.string().pattern(/^[A-Za-z0-9_-]{1,64}$/).allow(null),
  locale: Joi.string().valid('de', 'en', 'fr', 'ar').default('en'),
  // A chosen question option that maps to a direct settings change (validated server-side).
  apply: Joi.object({ node: Joi.string().pattern(/^[A-Za-z0-9_-]{1,64}$/).required(), config: Joi.object().max(30).required() }).allow(null),
}) };
