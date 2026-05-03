import Joi from 'joi';

export const runAgentSchema = Joi.object({
  input: Joi.string().min(3).max(2000).required(),
});

export const confirmAgentSchema = Joi.object({
  decision: Joi.boolean().required(),
});

export const listAgentRunsSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(20),
  skip: Joi.number().integer().min(0).default(0),
});
