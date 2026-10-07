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

  /**
   * Reserve a contiguous block of `count` numbers in a SINGLE atomic $inc, then
   * format them locally. This replaces N sequential round-trips (one per row) for
   * bulk imports — the previous per-row loop contended on the one counter doc and
   * made a 300-row import time out. Returns formatted numbers in ascending order.
   */
  async _getNextBlock(counterId, prefix, padLength, count) {
    const n = Math.max(0, Math.trunc(Number(count) || 0));
    if (n === 0) return [];
    try {
      const counter = await Counter.findOneAndUpdate(
        { _id: counterId },
        { $inc: { seq: n } },
        { returnDocument: 'after', upsert: true },
      );
      const end = counter.seq; // last reserved value
      const start = end - n + 1; // first reserved value
      const out = new Array(n);
      for (let i = 0; i < n; i += 1) {
        out[i] = `${prefix}${String(start + i).padStart(padLength, '0')}`;
      }
      return out;
    } catch (err) {
      throw new AppError(
        `Failed to generate ${n} number(s) for ${counterId}: ${err.message}`,
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

  /** L-00001, L-00002, ... */
  async getNextLeadNumber() {
    return this._getNext('lead_number', 'L-', 5);
  }

  /** Reserve `count` lead numbers at once (bulk import). */
  async getNextLeadNumberBlock(count) {
    return this._getNextBlock('lead_number', 'L-', 5, count);
  }

  /** O-001, O-002, ... (scoped per customer) */
  async getNextSiteNumber(customerId) {
    return this._getNext(`site_number:${customerId}`, 'O-', 3);
  }
}

const counterService = new CounterService();
export default counterService;
