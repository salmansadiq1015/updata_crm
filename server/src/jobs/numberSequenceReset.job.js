import { BaseWorker } from '../shared/queue/BaseWorker.js';
import logger from '../shared/logger/index.js';

/**
 * Number sequence reset job.
 *
 * Resets annual document number sequences (quotation, order, invoice)
 * when the year rolls over. Runs on January 1st at 00:01.
 */
export class NumberSequenceResetWorker extends BaseWorker {
  constructor() {
    super('number-sequence-reset');
  }

  async process(job) {
    const newYear = new Date().getFullYear();

    // Lazy import
    const DocumentNumberSequence = (
      await import('../modules/qop/documentNumberSequence.model.js')
    ).default;

    const staleSequences = await DocumentNumberSequence.find({
      resetsAnnually: true,
      currentYear: { $lt: newYear },
    }).lean();

    let resetCount = 0;

    for (const seq of staleSequences) {
      await DocumentNumberSequence.updateOne(
        { _id: seq._id },
        { $set: { currentValue: 0, currentYear: newYear } },
      );
      resetCount++;
    }

    logger.info('Number sequence reset completed', {
      module: 'jobs',
      action: 'number-sequence-reset',
      resetCount,
      newYear,
    });

    return { resetCount };
  }
}

export default NumberSequenceResetWorker;
