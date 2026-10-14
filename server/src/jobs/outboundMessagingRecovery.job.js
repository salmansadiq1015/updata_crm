import { BaseWorker } from '../shared/queue/BaseWorker.js';
import messagingService from '../modules/messaging/messaging.service.js';

/**
 * Periodic durability sweep for outreach jobs. The service deliberately marks
 * provider-bound stale work unknown instead of resending it.
 */
export class OutboundMessagingRecoveryWorker extends BaseWorker {
  constructor() { super('outbound-messaging-recovery'); }
  async process() {
    const recovery = await messagingService.recoverStaleWork();
    const reconciliation = await messagingService.reconcileProviderStatuses();
    const monitoring = await messagingService.monitorProviders();
    return {
      recovery, reconciliation,
      monitoring: {
        checkedAt: monitoring.checkedAt,
        providers: Object.fromEntries(Object.entries(monitoring.snapshots).map(([key, value]) => [key, value.status])),
      },
    };
  }
}

export default OutboundMessagingRecoveryWorker;
