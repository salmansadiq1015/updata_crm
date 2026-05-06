import Counter from '../crm/counter.model.js';
import { AppError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';

/**
 * Accounting counter service.
 * Reuses the CRM Counter model for atomic auto-numbering.
 */
class AccountingCounterService {
  async getNextJournalEntryNumber() {
    const year = new Date().getFullYear();
    const counterId = `accounting:journal:${year}`;

    try {
      const counter = await Counter.findOneAndUpdate(
        { _id: counterId },
        { $inc: { seq: 1 } },
        { returnDocument: 'after', upsert: true },
      );
      return counter.seq;
    } catch (err) {
      throw new AppError(
        `Failed to generate journal entry number: ${err.message}`,
        500,
        ERROR_CODES.ACCT_COUNTER_FAILED,
      );
    }
  }

  async getNextApInvoiceNumber() {
    const year = new Date().getFullYear();
    const counterId = `accounting:ap_invoice:${year}`;

    try {
      const counter = await Counter.findOneAndUpdate(
        { _id: counterId },
        { $inc: { seq: 1 } },
        { returnDocument: 'after', upsert: true },
      );
      return `APR-${year}-${String(counter.seq).padStart(5, '0')}`;
    } catch (err) {
      throw new AppError(
        `Failed to generate AP invoice number: ${err.message}`,
        500,
        ERROR_CODES.ACCT_COUNTER_FAILED,
      );
    }
  }

  async getNextPaymentBatchNumber() {
    const year = new Date().getFullYear();
    const counterId = `accounting:payment_batch:${year}`;

    try {
      const counter = await Counter.findOneAndUpdate(
        { _id: counterId },
        { $inc: { seq: 1 } },
        { returnDocument: 'after', upsert: true },
      );
      return `PB-${year}-${String(counter.seq).padStart(5, '0')}`;
    } catch (err) {
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
