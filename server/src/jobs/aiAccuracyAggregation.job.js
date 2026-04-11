import { BaseWorker } from '../shared/queue/BaseWorker.js';
import logger from '../shared/logger/index.js';

export class AiAccuracyAggregationWorker extends BaseWorker {
  constructor() {
    super('ai-accuracy-aggregation');
  }

  async process(job) {
    const aiAnalyticsService = (await import('../modules/ai/aiAnalytics.service.js')).default;

    // Compute metrics for the previous month
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const period = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;

    try {
      await aiAnalyticsService.aggregateMonthlyMetrics(period);

      logger.info('AI accuracy aggregation completed', {
        module: 'jobs',
        action: 'ai-accuracy-aggregation',
        period,
      });

      return { period, status: 'completed' };
    } catch (err) {
      logger.error('AI accuracy aggregation failed', {
        module: 'jobs',
        action: 'ai-accuracy-aggregation',
        period,
        error: { message: err.message, stack: err.stack },
      });
      throw err;
    }
  }
}
