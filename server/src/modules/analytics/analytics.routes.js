import { Router } from 'express';
import Joi from 'joi';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import auditService from '../auth/audit.service.js';
import attributionService from './attribution.service.js';
import { ATTRIBUTION_MODELS, GROUP_BY } from './attribution.engine.js';

/**
 * Business analytics — mounted at /api/v1/analytics (app.js).
 *   GET /attribution         campaign/channel/agent performance + attribution (JSON)
 *   GET /attribution/export  the same rows as CSV (audit-logged)
 */
export const CHANNELS = Object.freeze(['ai_call', 'sim_call', 'sim_sms', 'email', 'sms', 'whatsapp', 'mobile_call', 'mobile_sms', 'discovery']);

const attributionQuery = {
  query: Joi.object({
    from: Joi.date().iso(),
    to: Joi.date().iso().when('from', { is: Joi.exist(), then: Joi.date().min(Joi.ref('from')) }),
    groupBy: Joi.string().valid(...GROUP_BY).default('campaign'),
    model: Joi.string().valid(...ATTRIBUTION_MODELS).default('linear'),
    currency: Joi.string().length(3).uppercase().default('CHF'),
    channels: Joi.array().items(Joi.string().valid(...CHANNELS)).single(),
    includeDiscovery: Joi.boolean().default(false),
  }),
};

const router = Router();
const guard = [authenticate, requirePermission('analytics:attribution:read'), validate(attributionQuery)];

router.get('/attribution', ...guard, async (req, res, next) => {
  try {
    return res.success({ data: await attributionService.attribution(req.user, req._validatedQuery) });
  } catch (err) { return next(err); }
});

router.get('/attribution/export', ...guard, async (req, res, next) => {
  try {
    const q = req._validatedQuery;
    const report = await attributionService.attribution(req.user, q);
    auditService.logEvent({
      eventType: 'analytics.attribution.exported',
      userId: req.user._id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      result: 'success',
      details: { groupBy: q.groupBy, model: q.model, from: report.period.from, to: report.period.to, rows: report.rows.length },
      module: 'analytics',
    });
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="campaign-performance-${q.groupBy}-${date}.csv"`);
    return res.send(attributionService.toCsv(report));
  } catch (err) { return next(err); }
});

export default router;
