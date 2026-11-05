import { CURRENCY_CODES } from '../../shared/data/currencies.js';
import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

export const dashboardSnapshotSchema = {
  query: Joi.object({
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')),
    currency: Joi.string().trim().uppercase().valid(...CURRENCY_CODES).default('CHF'),
    companyId: objectId,
    branchId: objectId,
    forecastDays: Joi.number().integer().min(7).max(365).default(90),
  }),
};
