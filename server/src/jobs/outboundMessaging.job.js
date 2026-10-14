import { BaseWorker } from '../shared/queue/BaseWorker.js';
import messagingService from '../modules/messaging/messaging.service.js';
import MessageRecipient from '../modules/messaging/messageRecipient.model.js';

export class OutboundMessagingWorker extends BaseWorker {
  constructor() { super('outbound-messaging'); }
  async isAlreadyDone(job) {
    const recipient = await MessageRecipient.findById(job.data.recipientId).select('status').lean();
    return !recipient || recipient.status !== 'queued';
  }
  async process(job) { return messagingService.dispatchRecipient(job.data.recipientId); }
}

export default OutboundMessagingWorker;
