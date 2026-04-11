import Joi from 'joi';

const ACCURACY_FEATURES = ['STT', 'INTENT', 'ENTITY_EXTRACTION', 'ADDRESS_PARSING'];

export const accuracySchema = {
  query: Joi.object({
    period: Joi.string().pattern(/^\d{4}-\d{2}$/),
    feature: Joi.string().valid(...ACCURACY_FEATURES),
    language: Joi.string(),
  }),
};

export const usageStatsSchema = {
  query: Joi.object({
    dateFrom: Joi.date().required(),
    dateTo: Joi.date().required(),
  }),
};

export const topCorrectionsSchema = {
  query: Joi.object({
    language: Joi.string(),
    limit: Joi.number().integer().min(1).max(100).default(20),
  }),
};
