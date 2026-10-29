import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';
import { TEAM_MEMBER_ROLES } from './team.model.js';

export const REVEAL_PURPOSES = Object.freeze(['view', 'call', 'sms', 'whatsapp', 'email']);
export const REVEAL_FIELDS = Object.freeze(['phone', 'mobile', 'email']);
export const ACCESS_LOG_ACTIONS = Object.freeze(['grant', 'access', 'reveal', 'export']);

const member = Joi.object({
  userId: objectId.required(),
  role: Joi.string().valid(...TEAM_MEMBER_ROLES).default('member'),
});

const leadScope = Joi.object({
  shareUnassigned: Joi.boolean(),
  sources: Joi.array().items(Joi.string().trim().max(60)).max(20),
});

export const teamId = { params: Joi.object({ id: objectId.required() }) };

export const listTeams = { query: Joi.object({ includeInactive: Joi.boolean().default(false) }) };

export const createTeam = {
  body: Joi.object({
    name: Joi.string().trim().min(1).max(120).required(),
    description: Joi.string().trim().max(500).allow('').default(''),
    members: Joi.array().items(member).max(500).default([]),
    leadScope: leadScope.default({}),
  }),
};

export const updateTeam = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    name: Joi.string().trim().min(1).max(120),
    description: Joi.string().trim().max(500).allow(''),
    members: Joi.array().items(member).max(500),
    leadScope,
    isActive: Joi.boolean(),
  }).min(1),
};

export const createGrant = {
  body: Joi.object({
    leadId: objectId.required(),
    reason: Joi.string().trim().min(5).max(500).required(),
  }),
};

export const revealContact = {
  params: Joi.object({ leadId: objectId.required() }),
  body: Joi.object({
    purpose: Joi.string().valid(...REVEAL_PURPOSES).required(),
    fields: Joi.array().items(Joi.string().valid(...REVEAL_FIELDS)).min(1).max(3).default([...REVEAL_FIELDS]),
  }),
};

export const accessLog = {
  query: Joi.object({
    userId: objectId,
    leadId: objectId,
    action: Joi.string().valid(...ACCESS_LOG_ACTIONS),
    from: Joi.date().iso(),
    to: Joi.date().iso(),
    cursor: Joi.string().allow(''),
    limit: Joi.number().integer().min(1).max(100).default(50),
  }),
};

export const leadAccessLog = {
  params: Joi.object({ leadId: objectId.required() }),
  query: Joi.object({ limit: Joi.number().integer().min(1).max(100).default(50) }),
};
