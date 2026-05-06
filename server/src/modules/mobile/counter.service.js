import Counter from '../crm/counter.model.js';
import { AppError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';

/**
 * Mobile counter service.
 * Reuses the CRM Counter model for atomic auto-numbering.
 * Report numbers are year-scoped: RPT-2026-00001, RPT-2026-00002, ...
 * Small-order numbers are year-scoped: SMO-2026-00001, SMO-2026-00002, ...
 */
class MobileCounterService {
  async getNextReportNumber() {
    const year = new Date().getFullYear();
    const counterId = `report_number:${year}`;

    try {
      const counter = await Counter.findOneAndUpdate(
        { _id: counterId },
        { $inc: { seq: 1 } },
        { returnDocument: 'after', upsert: true },
      );
      return `RPT-${year}-${String(counter.seq).padStart(5, '0')}`;
    } catch (err) {
      throw new AppError(
        `Failed to generate report number: ${err.message}`,
        500,
        ERROR_CODES.MOBILE_COUNTER_FAILED,
      );
    }
  }

  async getNextSmallOrderNumber() {
    const year = new Date().getFullYear();
    const counterId = `small_order_number:${year}`;

    try {
      const counter = await Counter.findOneAndUpdate(
        { _id: counterId },
        { $inc: { seq: 1 } },
        { returnDocument: 'after', upsert: true },
      );
      return `SMO-${year}-${String(counter.seq).padStart(5, '0')}`;
    } catch (err) {
      throw new AppError(
        `Failed to generate small order number: ${err.message}`,
        500,
        ERROR_CODES.MOBILE_COUNTER_FAILED,
      );
    }
  }
}

const mobileCounterService = new MobileCounterService();
export default mobileCounterService;
