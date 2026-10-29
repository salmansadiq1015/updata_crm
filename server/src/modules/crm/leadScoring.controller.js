import leadScoringService from './leadScoring.service.js';
import { ServiceUnavailableError } from '../../shared/errors/AppError.js';

const metaOf = (req) => ({ ipAddress: req.ip, userAgent: req.get('user-agent') });

class LeadScoringController {
  async explain(req, res, next) {
    try {
      return res.success({ data: await leadScoringService.explain(req.params.leadId) });
    } catch (err) { return next(err); }
  }

  async recalculate(req, res, next) {
    try {
      const data = await leadScoringService.recalculate(req.params.leadId, { userId: req.user._id, meta: metaOf(req), reason: 'manual' });
      return res.success({ data, message: 'Score recalculated' });
    } catch (err) { return next(err); }
  }

  async getConfig(req, res, next) {
    try {
      const config = await leadScoringService.getActiveConfig({ fresh: true });
      return res.success({ data: { config, ...leadScoringService.describe() } });
    } catch (err) { return next(err); }
  }

  async updateConfig(req, res, next) {
    try {
      const config = await leadScoringService.updateConfig(req.body, req.user._id, metaOf(req));
      return res.success({ data: { config, ...leadScoringService.describe() }, message: 'Scoring config saved; recompute queued' });
    } catch (err) { return next(err); }
  }

  async versions(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      return res.success({ data: await leadScoringService.listVersions(query) });
    } catch (err) { return next(err); }
  }

  async preview(req, res, next) {
    try {
      return res.success({ data: await leadScoringService.preview(req.body.config, req.body.leadId) });
    } catch (err) { return next(err); }
  }

  async recompute(req, res, next) {
    try {
      const config = await leadScoringService.getActiveConfig({ fresh: true });
      const queued = await leadScoringService.scheduleRecomputeAll(config.version);
      if (!queued) throw new ServiceUnavailableError('The background queue is unavailable; try again later');
      return res.success({ data: { queued, version: config.version }, message: 'Recompute queued', statusCode: 202 });
    } catch (err) { return next(err); }
  }
}

export default new LeadScoringController();
