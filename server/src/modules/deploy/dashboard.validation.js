import Joi from 'joi';

export const dashboardSummarySchema = {
  query: Joi.object({
    date: Joi.date().iso().default(() => new Date().toISOString().split('T')[0]),
  }),
};

export const dashboardUtilizationSchema = {
  query: Joi.object({
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso(),
    employeeIds: Joi.string().allow(''),
  }),
};

export const dashboardAlertsSchema = {
  query: Joi.object({}),
};
