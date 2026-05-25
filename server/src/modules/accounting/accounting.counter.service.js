import Counter from '../crm/counter.model.js';
import { AppError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';

function isRetryableTransactionError(err) {
  return typeof err?.hasErrorLabel === 'function'
    && (
      err.hasErrorLabel('TransientTransactionError')
      || err.hasErrorLabel('UnknownTransactionCommitResult')
    );
}

/**
 * Accounting counter service.
 * Reuses the CRM Counter model for atomic auto-numbering.
 */
class AccountingCounterService {
  async getNextJournalEntryNumber(options = {}) {
    const year = new Date().getFullYear();
    const counterId = `accounting:journal:${year}`;

    try {
      const counter = await Counter.findOneAndUpdate(
        { _id: counterId },
        { $inc: { seq: 1 } },
        { returnDocument: 'after', upsert: true, session: options.session },
      );
      return counter.seq;
    } catch (err) {
      if (options.session && isRetryableTransactionError(err)) throw err;
      throw new AppError(
        `Failed to generate journal entry number: ${err.message}`,
        500,
        ERROR_CODES.ACCT_COUNTER_FAILED,
      );
    }
  }

  async getNextApInvoiceNumber(options = {}) {
    const year = new Date().getFullYear();
    const counterId = `accounting:ap_invoice:${year}`;

    try {
      const counter = await Counter.findOneAndUpdate(
        { _id: counterId },
        { $inc: { seq: 1 } },
        { returnDocument: 'after', upsert: true, session: options.session },
      );
      return `APR-${year}-${String(counter.seq).padStart(5, '0')}`;
    } catch (err) {
      if (options.session && isRetryableTransactionError(err)) throw err;
      throw new AppError(
        `Failed to generate AP invoice number: ${err.message}`,
        500,
        ERROR_CODES.ACCT_COUNTER_FAILED,
      );
    }
  }

  async getNextPaymentBatchNumber(options = {}) {
    const year = new Date().getFullYear();
    const counterId = `accounting:payment_batch:${year}`;

    try {
      const counter = await Counter.findOneAndUpdate(
        { _id: counterId },
        { $inc: { seq: 1 } },
        { returnDocument: 'after', upsert: true, session: options.session },
      );
      return `PB-${year}-${String(counter.seq).padStart(5, '0')}`;
    } catch (err) {
      if (options.session && isRetryableTransactionError(err)) throw err;
      throw new AppError(
        `Failed to generate payment batch number: ${err.message}`,
        500,
        ERROR_CODES.ACCT_COUNTER_FAILED,
      );
    }
  }
}

const accountingCounterService = new AccountingCounterService();
export default accountingCounterService;
