import Counter from './counter.model.js';
import { AppError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';

/**
 * Atomic auto-numbering service.
 * Uses findOneAndUpdate + $inc with upsert for race-condition-free sequences.
 */
class CounterService {
  async _getNext(counterId, prefix, padLength) {
    try {
      const counter = await Counter.findOneAndUpdate(
        { _id: counterId },
        { $inc: { seq: 1 } },
        { returnDocument: 'after', upsert: true },
      );
      return `${prefix}${String(counter.seq).padStart(padLength, '0')}`;
    } catch (err) {
      throw new AppError(
        `Failed to generate number for ${counterId}: ${err.message}`,
        500,
        ERROR_CODES.COUNTER_GENERATION_FAILED,
      );
    }
  }

  /** K-00001, K-00002, ... */
  async getNextCustomerNumber() {
    return this._getNext('customer_number', 'K-', 5);
  }

  /** A-00001, A-00002, ... */
  async getNextInstallationNumber() {
    return this._getNext('installation_number', 'A-', 5);
  }

  /** O-001, O-002, ... (scoped per customer) */
  async getNextSiteNumber(customerId) {
    return this._getNext(`site_number:${customerId}`, 'O-', 3);
  }
}

const counterService = new CounterService();
export default counterService;
