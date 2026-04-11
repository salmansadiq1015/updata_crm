import { BaseWorker } from '../shared/queue/BaseWorker.js';
import healthService from '../modules/health/health.service.js';
import eventBus from '../shared/events/EventBus.js';
import EVENT_TYPES from '../shared/events/eventTypes.js';
import logger from '../shared/logger/index.js';

/**
 * Periodic health check job.
 * Runs every 60s via cron. Publishes degradation/recovery events.
 */

let previousStatus = 'ok';

export class HealthCheckWorker extends BaseWorker {
  constructor() {
    super('health-check');
  }

  async process(_job) {
    const result = await healthService.getReadiness();

    // Detect status transitions
    if (result.status !== 'ok' && previousStatus === 'ok') {
      // Degradation detected
      const unhealthy = Object.entries(result.checks)
        .filter(([, v]) => v.status !== 'ok')
        .map(([k, v]) => ({ dependency: k, ...v }));

      for (const dep of unhealthy) {
        eventBus.publish(EVENT_TYPES.SYSTEM_HEALTH_DEGRADED, dep, { source: 'core:health' });
      }

      logger.warn('System health degraded', {
        module: 'health',
        action: 'check',
        status: result.status,
        unhealthy,
      });
    } else if (result.status === 'ok' && previousStatus !== 'ok') {
      // Recovery detected
      eventBus.publish(EVENT_TYPES.SYSTEM_HEALTH_RECOVERED, {
        status: 'ok',
      }, { source: 'core:health' });

      logger.info('System health recovered', {
        module: 'health',
        action: 'check',
        status: 'ok',
      });
    }

    previousStatus = result.status;
    return result;
  }
}

export default HealthCheckWorker;
