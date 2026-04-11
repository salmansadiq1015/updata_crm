import { BaseWorker } from '../shared/queue/BaseWorker.js';
import logger from '../shared/logger/index.js';

export class IntegrationHealthCheckWorker extends BaseWorker {
  constructor() {
    super('integration-health-check');
  }

  async process(job) {
    const integrationHealthService = (await import('../modules/integrations/integrationHealth.service.js')).default;

    try {
      const results = await integrationHealthService.runAllHealthChecks();

      const summary = {
        total: results.length,
        healthy: results.filter((r) => r.status === 'healthy').length,
        degraded: results.filter((r) => r.status === 'degraded').length,
        down: results.filter((r) => r.status === 'down').length,
      };

      if (summary.down > 0 || summary.degraded > 0) {
        logger.warn('Integration health check found issues', {
          module: 'jobs',
          action: 'integration-health-check',
          ...summary,
        });
      }

      return summary;
    } catch (err) {
      logger.error('Integration health check job failed', {
        module: 'jobs',
        action: 'integration-health-check',
        error: { message: err.message, stack: err.stack },
      });
      throw err;
    }
  }
}

export default IntegrationHealthCheckWorker;
