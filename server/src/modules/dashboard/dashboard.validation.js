import Joi from 'joi';
import { DASHBOARD_RANGE_PRESETS } from './dashboard.service.js';

/** GET /dashboard/analytics and /dashboard/intelligence period filters. */
export const analyticsQuerySchema = Joi.object({
  range: Joi.string().valid(...Object.keys(DASHBOARD_RANGE_PRESETS)).default('30d'),
  granularity: Joi.string().valid('day', 'week', 'month'),
});

export default { analyticsQuerySchema };
