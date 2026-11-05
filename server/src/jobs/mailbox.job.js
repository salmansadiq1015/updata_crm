import { BaseWorker } from '../shared/queue/BaseWorker.js';
import { synchronize, deliver, sweep, analyzeIncoming } from '../modules/email/email.service.js';
import logger from '../shared/logger/index.js';
export class MailboxWorker extends BaseWorker {
  constructor() { super('mailbox'); }
  async process(job) {
    if (job.name === 'analyze') return analyzeIncoming(job.data.ownerId, job.data.messageId);
    if (job.name === 'sync') return synchronize(job.data.accountId);
    if (job.name === 'send') return deliver(job.data.messageId);
    return sweep();
  }
}
export function registerMailboxJobs(queue) {
  queue.registerQueue('mailbox', new MailboxWorker().getHandler(), { concurrency: 4, jobOptions: { attempts: 1, removeOnComplete: { age: 3600, count: 200 }, removeOnFail: { age: 86400, count: 500 } } });
  queue.addScheduledJob('mailbox', 'mailbox-sweep', {}, '* * * * *').catch(e => logger.warn('Mailbox sweep scheduling failed', { module: 'email', error: e.message }));
}
