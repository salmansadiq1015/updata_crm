import { BaseWorker } from '../shared/queue/BaseWorker.js';
import logger from '../shared/logger/index.js';

export class FieldTicketEscalationWorker extends BaseWorker {
  constructor() {
    super('field-ticket-escalation');
  }

  async process(_job) {
    const fieldTicketService = (await import('../modules/fieldTickets/fieldTicket.service.js')).default;
    const result = await fieldTicketService.escalateOverdue(new Date());

    logger.info('Field ticket escalation scan completed', {
      module: 'jobs',
      action: 'field-ticket-escalation',
      escalatedCount: result.escalatedCount,
    });

    return result;
  }
}

export default FieldTicketEscalationWorker;
