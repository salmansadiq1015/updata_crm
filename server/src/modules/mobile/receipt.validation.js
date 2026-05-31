import Joi from 'joi';

export const uploadReceiptSchema = {
  body: Joi.object({
    notes: Joi.string().trim().max(1000).allow('', null),
    projectReference: Joi.string().trim().max(120).allow('', null),
  }),
};
