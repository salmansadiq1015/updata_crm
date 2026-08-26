import Joi from 'joi';

export const runAgentSchema = Joi.object({
  // A single character is a legitimate answer: the assistant offers numbered
  // choices, and "1" must reach it.
  input: Joi.string().min(1).max(2000).required(),
  threadId: Joi.string().max(100).optional(),
  correlationId: Joi.string().max(120).optional(),
  context: Joi.object().unknown(true).allow(null).optional(),
});

/**
 * The fields a person may correct when approving (C2 "Override").
 *
 * Deliberately the planner's own parameters and nothing else: approving with
 * changes must not become a way to reach fields the agent was never allowed
 * to set. Prices, for instance, are not here — no agent sets one.
 */
export const OVERRIDABLE_FIELDS = Object.freeze([
  'title', 'description', 'priority', 'dueDate', 'dateTime', 'durationHours',
  'assigneeName', 'customerName', 'projectName', 'installationName',
  'status', 'messageContent',
]);

export const confirmAgentSchema = Joi.object({
  decision: Joi.boolean().required(),
  overrides: Joi.object(
    Object.fromEntries(OVERRIDABLE_FIELDS.map((field) => [
      field,
      Joi.alternatives().try(Joi.string().allow('', null).max(2000), Joi.number(), Joi.date()),
    ])),
  ).unknown(false).default({}),
});

export const listAgentRunsSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(20),
  skip: Joi.number().integer().min(0).default(0),
});
