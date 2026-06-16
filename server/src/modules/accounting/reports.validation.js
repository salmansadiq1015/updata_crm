import Joi from 'joi';

export const profitLossSchema = {
  query: Joi.object({
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')),
    currency: Joi.string().valid('CHF', 'EUR').default('CHF'),
  }),
};
