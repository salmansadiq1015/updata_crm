import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';
import { FISCAL_PERIOD_STATUSES } from './fiscalPeriod.model.js';

export const listFiscalPeriodsSchema = {
  query: Joi.object({
    status: Joi.string().valid(...FISCAL_PERIOD_STATUSES),
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso(),
  }),
};

export const createFiscalPeriodSchema = {
  body: Joi.object({
    name: Joi.string().trim().max(120).required(),
    startDate: Joi.date().iso().required(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')).required(),
    status: Joi.string().valid('OPEN').default('OPEN'),
  }),
};

export const fiscalPeriodIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const closeFiscalPeriodSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    reason: Joi.string().trim().min(3).max(500).required(),
  }),
};

export const reopenFiscalPeriodSchema = closeFiscalPeriodSchema;
