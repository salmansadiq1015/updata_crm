import { BaseWorker } from '../shared/queue/BaseWorker.js';
import smsDeviceService from '../modules/simSms/smsDevice.service.js';
import recoveryService from '../modules/simSms/recovery.service.js';
import contactPolicyService from '../modules/contactPolicy/contactPolicy.service.js';
import logger from '../shared/logger/index.js';

/**
 * SMS operations sweep (every 5 min): devices that went offline (status history +
 * one alert per outage while a campaign runs), provider messaging failures into
 * the recovery inbox, contact-ledger pruning. Idempotent.
 */
export class SmsOpsSweepWorker extends BaseWorker {
  constructor() { super('sms-ops-sweep'); }
  async process() {
    const devices = await smsDeviceService.sweep();
    const provider = await recoveryService.collectProviderFailures().catch((e) => ({ error: e.message }));
    const ledger = await contactPolicyService.prune().catch((e) => ({ error: e.message }));
    return { devices, provider, ledger };
  }
}

export function registerSmsOpsSweepJob(queueManager) {
  const worker = new SmsOpsSweepWorker();
  queueManager.registerQueue('sms-ops-sweep', worker.getHandler(), {
    concurrency: 1,
    jobOptions: { attempts: 2, backoff: { type: 'exponential', delay: 10000 } },
  });
  queueManager.addScheduledJob('sms-ops-sweep', 'periodic-sms-ops-sweep', {}, '*/5 * * * *')
    .catch((err) => logger.warn('Failed to schedule SMS ops sweep', { module: 'jobs', error: { message: err.message } }));
}

export default SmsOpsSweepWorker;
