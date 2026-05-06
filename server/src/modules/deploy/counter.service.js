import Counter from '../crm/counter.model.js';
import { AppError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';

/**
 * Deploy counter service.
 * Reuses the CRM Counter model for atomic auto-numbering.
 * Assignment numbers are year-scoped: ASN-2026-00001, ASN-2026-00002, ...
 */
class DeployCounterService {
  async getNextAssignmentNumber() {
    const year = new Date().getFullYear();
    const counterId = `assignment_number:${year}`;

    try {
      const counter = await Counter.findOneAndUpdate(
        { _id: counterId },
        { $inc: { seq: 1 } },
        { returnDocument: 'after', upsert: true },
      );
      return `ASN-${year}-${String(counter.seq).padStart(5, '0')}`;
    } catch (err) {
      throw new AppError(
        `Failed to generate assignment number: ${err.message}`,
        500,
        ERROR_CODES.ASSIGNMENT_COUNTER_FAILED,
      );
    }
  }
}

const deployCounterService = new DeployCounterService();
export default deployCounterService;
