import { BaseWorker } from '../shared/queue/BaseWorker.js';
import aiCallingService from '../modules/aiCalling/aiCalling.service.js';

/**
 * Drives AI voice-calling campaigns. Each job is a campaign "tick" that leases
 * and dispatches due recipients up to the configured concurrency, then
 * re-enqueues itself while work remains. attempts:1 — the campaign state lives in
 * the recipient documents, so BullMQ never blindly retries a tick (which could
 * double-dial). Recovery after a crash happens via lease expiry plus the
 * reconciliation sweep's tick watchdog.
 */
export class OutboundCallingWorker extends BaseWorker {
  constructor() { super('outbound-calling'); }

  async process(job) {
    if (job.data?.kind === 'tick') {
      // The token identifies the tick chain; a superseded chain exits immediately.
      return aiCallingService.tickCampaign(job.data.campaignId, job.data.token || null);
    }
    return { skipped: true };
  }
}

export default OutboundCallingWorker;
