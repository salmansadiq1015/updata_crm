import { BaseWorker } from '../shared/queue/BaseWorker.js';

/**
 * Generic supplier/manufacturer catalog synchronization.
 *
 * Jobs either process one connection or run a due-scan that syncs all enabled
 * connections whose schedule has elapsed.
 */
export class CatalogSyncWorker extends BaseWorker {
  constructor() {
    super('catalog-sync');
  }

  async process(job) {
    const catalogConnectionService = (await import('../modules/catalog/catalogConnection.service.js')).default;
    if (job.data?.scanDue) {
      return catalogConnectionService.syncDueConnections();
    }
    return catalogConnectionService.syncConnection(job.data.connectionId, {
      mode: job.data.mode || 'MANUAL',
      triggeredBy: job.data.triggeredBy || null,
    });
  }
}

export default CatalogSyncWorker;
