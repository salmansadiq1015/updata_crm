import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';
import { INTELLIGENCE_CATEGORIES } from './engine/callIntelligence.js';
import { KNOWLEDGE_TYPES } from './engine/knowledgeCompliance.js';
import { MAX_TRANSFER_TIMEOUT_SECONDS, MIN_TRANSFER_TIMEOUT_SECONDS } from './engine/handoffPolicy.js';

const idParam = Joi.object({ id: objectId.required() });
const page = { page: Joi.number().integer().min(1).default(1), limit: Joi.number().integer().min(1).max(100).default(25) };

// ---- intelligence -----------------------------------------------------------
export const callId = { params: idParam };
export const reviewQueue = { query: Joi.object({ ...page, category: Joi.string().valid(...INTELLIGENCE_CATEGORIES) }) };
export const decideItem = {
  params: Joi.object({ id: objectId.required(), itemId: Joi.string().pattern(/^[0-9a-f]{24}$/).required() }),
  body: Joi.object({
    decision: Joi.string().valid('accept', 'edit', 'reject').required(),
    value: Joi.when('decision', { is: 'edit', then: Joi.string().trim().min(1).max(500).required(), otherwise: Joi.forbidden() }),
    normalized: Joi.when('decision', { is: 'edit', then: Joi.alternatives(Joi.string().max(100), Joi.number()).allow(null), otherwise: Joi.forbidden() }),
    note: Joi.string().trim().max(500).allow(''),
  }),
};

// ---- knowledge ----------------------------------------------------------------
const phrase = Joi.string().trim().min(1).max(300);
const entryFields = {
  type: Joi.string().valid(...KNOWLEDGE_TYPES),
  title: Joi.string().trim().min(1).max(200),
  content: Joi.string().trim().max(4000).allow(''),
  price: Joi.object({
    amount: Joi.number().min(0).allow(null),
    currency: Joi.string().trim().uppercase().length(3).allow(null),
    unit: Joi.string().trim().max(40).allow(null, ''),
    validUntil: Joi.date().iso().allow(null),
  }).allow(null),
  allowedPromises: Joi.array().items(phrase).max(30),
  forbiddenClaims: Joi.array().items(phrase).max(30),
  variants: Joi.array().items(Joi.object({
    language: Joi.string().trim().pattern(/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/).required(),
    title: Joi.string().trim().max(200).allow(''),
    content: Joi.string().trim().max(4000).allow(''),
  })).max(10),
  tags: Joi.array().items(Joi.string().trim().lowercase().max(40)).max(20),
};
export const listKnowledge = { query: Joi.object({ ...page, limit: Joi.number().integer().min(1).max(200).default(100), status: Joi.string().valid('draft', 'pending_approval', 'approved', 'archived'), type: Joi.string().valid(...KNOWLEDGE_TYPES), search: Joi.string().trim().max(100).allow('') }) };
export const createEntry = { body: Joi.object({ ...entryFields, type: entryFields.type.required(), title: entryFields.title.required() }) };
export const updateEntry = { params: idParam, body: Joi.object({ ...entryFields, revision: Joi.number().integer().min(1) }).min(1) };
export const entryId = { params: idParam };
export const approveEntry = { params: idParam, body: Joi.object({ revision: Joi.number().integer().min(1) }) };
export const rejectEntry = { params: idParam, body: Joi.object({ note: Joi.string().trim().max(500).allow('') }) };
export const publish = { body: Joi.object({ note: Joi.string().trim().max(500).allow('') }) };
export const listVersions = { query: Joi.object(page) };
export const versionId = { params: idParam };
export const rollback = { params: idParam, body: Joi.object({ note: Joi.string().trim().max(500).allow('') }) };
export const diff = { params: idParam, query: Joi.object({ from: objectId }) };
export const agentKnowledge = { params: idParam, body: Joi.object({
  mode: Joi.string().valid('latest', 'pinned', 'none').required(),
  versionId: Joi.when('mode', { is: 'pinned', then: objectId.required(), otherwise: objectId.allow(null) }),
  version: Joi.number().integer().min(1),
}) };

// ---- human transfer ------------------------------------------------------------
const hhmm = Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/);
export const presence = { body: Joi.object({
  available: Joi.boolean(),
  phone: Joi.string().trim().pattern(/^\+[1-9]\d{6,14}$/).allow(null, ''),
  workingHours: Joi.object({
    timezone: Joi.string().trim().max(80).default('UTC'),
    days: Joi.array().items(Joi.string().valid('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')).max(7),
    start: hhmm.allow(null, ''), end: hhmm.allow(null, ''),
  }).allow(null),
}).min(1) };
export const agentTransfer = { params: idParam, body: Joi.object({
  enabled: Joi.boolean().required(),
  targetUserIds: Joi.array().items(objectId).max(20).default([]),
  timeoutSeconds: Joi.number().integer().min(MIN_TRANSFER_TIMEOUT_SECONDS).max(MAX_TRANSFER_TIMEOUT_SECONDS).default(30),
  allowPhoneTransfer: Joi.boolean().default(true),
  version: Joi.number().integer().min(1),
}) };
export const acceptTransfer = { params: idParam, body: Joi.object({ mode: Joi.string().valid('web', 'phone').default('web') }) };
export const transferId = { params: idParam };

// ---- worker (per-call token) ---------------------------------------------------
const workerCall = Joi.object({ callId: Joi.string().max(200).required() });
export const workerTransfer = { params: workerCall, body: Joi.object({ reason: Joi.string().trim().max(500).allow(''), summary: Joi.string().trim().max(2000).allow('') }) };
export const workerCallOnly = { params: workerCall };
