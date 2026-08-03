import Counter from '../crm/counter.model.js';
import DocumentNumberSequence from './documentNumberSequence.model.js';
import { AppError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';

const DEFAULT_PREFIXES = {
  quotation: 'OFF',
  order: 'AUF',
  invoice: 'RE',
};

const ACTIVE_SEQUENCE_FILTER = { isActive: { $ne: false } };

function buildCounterId(documentType, departmentId, resetsAnnually, year) {
  const scope = resetsAnnually ? year : 'all';
  return `qop:${documentType}:${departmentId || 'global'}:${scope}`;
}

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
        ...ACTIVE_SEQUENCE_FILTER,
      }).lean();

      if (!sequence && departmentId) {
        sequence = await DocumentNumberSequence.findOne({
          documentType,
          departmentId: null,
          ...ACTIVE_SEQUENCE_FILTER,
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

      // Year string is part of both the number and the reconciliation prefix.
      let yearStr = '';
      if (yearFormat === 'YYYY') yearStr = String(year);
      else if (yearFormat === 'YY') yearStr = String(year).slice(-2);

      // 3. Annual reset check
      if (sequence && resetsAnnually && sequence.currentYear < year) {
        await DocumentNumberSequence.findByIdAndUpdate(sequence._id, {
          $set: { currentValue: 0, currentYear: year },
        });
      }

      // 4. Atomic counter increment, reconciled with the highest number already
      //    used for this scope. If the stored counter has fallen behind the real
      //    data (e.g. after a data import, seed or manual insert), this heals it
      //    automatically on the next generation instead of throwing duplicate-key
      //    errors. The $max keeps the sequence monotonic under concurrency: a
      //    stale maxUsed can never lower the counter.
      const counterId = buildCounterId(documentType, departmentId, resetsAnnually, year);
      const numberPrefix = [prefix, yearStr].filter(Boolean).join(separator) + separator;
      const maxUsed = await this._maxUsedSequence(documentType, numberPrefix, separator);
      const counter = await Counter.findOneAndUpdate(
        { _id: counterId },
        [{ $set: { seq: { $add: [{ $max: [{ $ifNull: ['$seq', 0] }, maxUsed] }, 1] } } }],
        { returnDocument: 'after', upsert: true, updatePipeline: true },
      );

      if (sequence) {
        await DocumentNumberSequence.findByIdAndUpdate(sequence._id, {
          $set: { currentValue: counter.seq, currentYear: year },
        });
      }

      // 5. Format the number
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
   * Resolve the document collection + number field for a QOP document type.
   * @private
   */
  async _docCollection(documentType) {
    if (documentType === 'invoice') {
      return { model: (await import('./invoice.model.js')).default, field: 'invoiceNumber' };
    }
    if (documentType === 'order') {
      return { model: (await import('./order.model.js')).default, field: 'orderNumber' };
    }
    if (documentType === 'quotation') {
      return { model: (await import('./quotation.model.js')).default, field: 'quotationNumber' };
    }
    return null;
  }

  /**
   * Highest sequence number already used by an existing document whose number
   * starts with `numberPrefix` (e.g. "RE-2026-"). Includes soft-deleted records
   * so their numbers are never reused. Returns 0 when none exist.
   * @private
   */
  async _maxUsedSequence(documentType, numberPrefix, separator) {
    const meta = await this._docCollection(documentType);
    if (!meta) return 0;
    const { model, field } = meta;
    const escaped = numberPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rows = await model.aggregate([
      { $match: { [field]: { $regex: `^${escaped}\\d+$` } } },
      { $project: { n: { $toInt: { $arrayElemAt: [{ $split: [`$${field}`, separator] }, -1] } } } },
      { $sort: { n: -1 } },
      { $limit: 1 },
    ]);
    return rows[0]?.n ?? 0;
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
    const resetsAnnually = sequence.resetsAnnually ?? true;

    const year = new Date().getFullYear();
    let yearStr = '';
    if (yearFormat === 'YYYY') yearStr = String(year);
    else if (yearFormat === 'YY') yearStr = String(year).slice(-2);

    const counterId = buildCounterId(
      sequence.documentType,
      sequence.departmentId || null,
      resetsAnnually,
      year,
    );
    // Mirror generation: reconcile with the highest number actually in use so
    // the preview matches what the next document will get.
    const numberPrefix = [prefix, yearStr].filter(Boolean).join(separator) + separator;
    const maxUsed = await this._maxUsedSequence(sequence.documentType, numberPrefix, separator);
    const counter = await Counter.findById(counterId).lean();
    const currentValue = Math.max(counter?.seq ?? sequence.currentValue ?? 0, maxUsed);
    const nextSeq = String(currentValue + 1).padStart(paddingLength, '0');

    const parts = [prefix];
    if (yearStr) parts.push(yearStr);
    parts.push(nextSeq);

    return parts.join(separator);
  }
}

const qopCounterService = new QOPCounterService();
export default qopCounterService;
