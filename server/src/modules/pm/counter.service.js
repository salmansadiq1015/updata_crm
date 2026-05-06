import Counter from '../crm/counter.model.js';
import { AppError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';

/**
 * PM counter service.
 * Reuses the CRM Counter model for atomic auto-numbering.
 * Project numbers are year-scoped: PRJ-2026-00001, PRJ-2026-00002, ...
 */
class PMCounterService {
  async getNextProjectNumber() {
    const year = new Date().getFullYear();
    const counterId = `project_number:${year}`;

    try {
      const counter = await Counter.findOneAndUpdate(
        { _id: counterId },
        { $inc: { seq: 1 } },
        { returnDocument: 'after', upsert: true },
      );
      return `PRJ-${year}-${String(counter.seq).padStart(5, '0')}`;
    } catch (err) {
      throw new AppError(
        `Failed to generate project number: ${err.message}`,
        500,
        ERROR_CODES.PROJECT_COUNTER_FAILED,
      );
    }
  }
}

const pmCounterService = new PMCounterService();
export default pmCounterService;
