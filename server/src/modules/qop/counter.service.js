import Counter from '../crm/counter.model.js';
import DocumentNumberSequence from './documentNumberSequence.model.js';
import { AppError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';

const DEFAULT_PREFIXES = {
  quotation: 'OFF',
  order: 'AUF',
  invoice: 'RE',
};

/**
 * QOP counter service.
 * Uses DocumentNumberSequence for configurable formatting and the CRM Counter
 * model for atomic auto-numbering.
 */
class QOPCounterService {
  async getNextQuotationNumber(departmentId = null) {
    return this._generateNumber('quotation', departmentId);
  }

  async getNextOrderNumber(departmentId = null) {
    return this._generateNumber('order', departmentId);
  }

  async getNextInvoiceNumber(departmentId = null) {
    return this._generateNumber('invoice', departmentId);
  }

  /**
   * Generate the next document number for the given type.
   * @private
   */
  async _generateNumber(documentType, departmentId) {
    try {
      // 1. Find sequence: specific department first, then global fallback
      let sequence = await DocumentNumberSequence.findOne({
        documentType,
        departmentId: departmentId || null,
      }).lean();

      if (!sequence && departmentId) {
        sequence = await DocumentNumberSequence.findOne({
          documentType,
          departmentId: null,
        }).lean();
      }

      // 2. Derive formatting from sequence or use defaults
      const prefix = sequence?.prefix || DEFAULT_PREFIXES[documentType];
      const separator = sequence?.separator ?? '-';
      const yearFormat = sequence?.yearFormat || 'YYYY';
      const paddingLength = sequence?.paddingLength || 4;
      const resetsAnnually = sequence?.resetsAnnually ?? true;

      const now = new Date();
      const year = now.getFullYear();

      // 3. Annual reset check
      if (sequence && resetsAnnually && sequence.currentYear < year) {
        await DocumentNumberSequence.findByIdAndUpdate(sequence._id, {
          $set: { currentValue: 0, currentYear: year },
        });
      }

      // 4. Atomic counter increment
      const counterId = `qop:${documentType}:${departmentId || 'global'}:${year}`;
      const counter = await Counter.findOneAndUpdate(
        { _id: counterId },
        { $inc: { seq: 1 } },
        { returnDocument: 'after', upsert: true },
      );

      // 5. Format the number
      let yearStr = '';
      if (yearFormat === 'YYYY') yearStr = String(year);
      else if (yearFormat === 'YY') yearStr = String(year).slice(-2);

      const seq = String(counter.seq).padStart(paddingLength, '0');

      const parts = [prefix];
      if (yearStr) parts.push(yearStr);
      parts.push(seq);

      return parts.join(separator);
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(
        `Failed to generate ${documentType} number: ${err.message}`,
        500,
        ERROR_CODES.QOP_COUNTER_FAILED,
      );
    }
  }

  /**
   * Preview what the next number would look like without incrementing.
   */
  async previewNumber(sequenceId) {
    const sequence = await DocumentNumberSequence.findById(sequenceId).lean();
    if (!sequence) return null;

    const prefix = sequence.prefix;
    const separator = sequence.separator ?? '-';
    const yearFormat = sequence.yearFormat || 'YYYY';
    const paddingLength = sequence.paddingLength || 4;

    const year = new Date().getFullYear();
    let yearStr = '';
    if (yearFormat === 'YYYY') yearStr = String(year);
    else if (yearFormat === 'YY') yearStr = String(year).slice(-2);

    const nextSeq = String((sequence.currentValue || 0) + 1).padStart(paddingLength, '0');

    const parts = [prefix];
    if (yearStr) parts.push(yearStr);
    parts.push(nextSeq);

    return parts.join(separator);
  }
}

const qopCounterService = new QOPCounterService();
export default qopCounterService;
