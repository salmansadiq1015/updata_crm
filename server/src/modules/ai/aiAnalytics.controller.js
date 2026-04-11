import aiAnalyticsService from './aiAnalytics.service.js';

class AiAnalyticsController {
  async getAccuracy(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const data = await aiAnalyticsService.getAccuracy(query);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async getUsageStats(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const data = await aiAnalyticsService.getUsageStats(query);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async getTopCorrections(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const data = await aiAnalyticsService.getTopCorrections(query);
      return res.success({ data });
    } catch (err) { next(err); }
  }
}

const aiAnalyticsController = new AiAnalyticsController();
export default aiAnalyticsController;
