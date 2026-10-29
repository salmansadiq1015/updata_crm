import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';
import { FACTOR_KEYS } from './leadScoring.engine.js';

const multiplier = Joi.number().min(0).max(1);
const minTier = Joi.array().items(Joi.object({ min: Joi.number().min(0).required(), multiplier: multiplier.required() })).max(10);
const choiceTable = (keys) => Joi.object(Object.fromEntries(keys.map((k) => [k, multiplier])));

const factorSetting = Joi.object({
  enabled: Joi.boolean(),
  maxPoints: Joi.number().min(0).max(100),
});

export const scoringConfigBody = Joi.object({
  bands: Joi.object({
    hot: Joi.number().integer().min(1).max(100).required(),
    warm: Joi.number().integer().min(0).max(100).required(),
  }).custom((value, helpers) => (value.warm > value.hot ? helpers.error('any.invalid') : value))
    .messages({ 'any.invalid': 'bands.warm must not exceed bands.hot' }),
  minEvidence: Joi.number().integer().min(0).max(20),
  targetBusinessTypes: Joi.array().items(Joi.string().trim().max(120)).max(200),
  targetCities: Joi.array().items(Joi.string().trim().max(120)).max(200),
  factors: Joi.object(Object.fromEntries(FACTOR_KEYS.map((k) => [k, factorSetting]))),
  rules: Joi.object({
    ratingTiers: minTier,
    reviewTiers: minTier,
    connectedCallTiers: minTier,
    smsReplyTiers: minTier,
    recencyTiers: Joi.array().items(Joi.object({ maxDays: Joi.number().integer().min(0).max(3650).required(), multiplier: multiplier.required() })).max(10),
    decisionAuthority: choiceTable(['decision_maker', 'influencer', 'no_authority']),
    timeline: choiceTable(['immediate', 'within_3_months', 'within_6_months', 'later']),
    interest: choiceTable(['high', 'medium', 'low', 'none']),
  }),
  note: Joi.string().trim().max(500).allow('', null),
});

export const updateScoringConfig = { body: scoringConfigBody };

export const previewScoringConfig = {
  body: Joi.object({ leadId: objectId.required(), config: scoringConfigBody.required() }),
};

export const leadScoreParam = {
  params: Joi.object({ leadId: objectId.required() }),
};

export const scoringVersions = {
  query: Joi.object({ limit: Joi.number().integer().min(1).max(100).default(20) }),
};
