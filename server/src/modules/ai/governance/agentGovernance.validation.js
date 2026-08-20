import Joi from 'joi';

export const agentKeyParamSchema = {
  params: Joi.object({
    key: Joi.string().max(60).required(),
  }),
};

export const setEnabledSchema = {
  params: Joi.object({
    key: Joi.string().max(60).required(),
  }),
  body: Joi.object({
    isEnabled: Joi.boolean().required(),
    reason: Joi.string().max(500).allow('', null).optional(),
  }),
};

export const emergencyStopSchema = {
  body: Joi.object({
    active: Joi.boolean().required(),
    reason: Joi.string().max(500).allow('', null).optional(),
  }),
};
