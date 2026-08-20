import Joi from 'joi';

export const runAgentSchema = Joi.object({
  // A single character is a legitimate answer: the assistant offers numbered
  // choices, and "1" must reach it.
  input: Joi.string().min(1).max(2000).required(),
  threadId: Joi.string().max(100).optional(),
  correlationId: Joi.string().max(120).optional(),
  context: Joi.object().unknown(true).allow(null).optional(),
});

export const confirmAgentSchema = Joi.object({
  decision: Joi.boolean().required(),
});

export const listAgentRunsSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(20),
  skip: Joi.number().integer().min(0).default(0),
});
