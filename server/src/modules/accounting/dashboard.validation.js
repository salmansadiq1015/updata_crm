import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

export const dashboardSnapshotSchema = {
  query: Joi.object({
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')),
    currency: Joi.string().valid('CHF', 'EUR').default('CHF'),
    companyId: objectId,
    branchId: objectId,
    forecastDays: Joi.number().integer().min(7).max(365).default(90),
  }),
};
