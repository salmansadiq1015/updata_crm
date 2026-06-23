import { BaseWorker } from '../shared/queue/BaseWorker.js';

export class IghScheduledSyncWorker extends BaseWorker {
  constructor() {
    super('igh-scheduled-sync');
  }

  async process() {
    const ighService = (await import('../modules/catalog/igh.service.js')).default;
    return ighService.runScheduledSync();
  }
}

export default IghScheduledSyncWorker;
