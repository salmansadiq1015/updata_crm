import ExtensionImport, { EXTENSION_IMPORT_STATUS } from './extensionImport.model.js';
import logger from '../../shared/logger/index.js';

/**
 * Tracks extension bulk-import runs CRM-side and streams live progress to the
 * importing user over the existing Socket.IO infrastructure (personal room =
 * the user id). Every bulk-import batch calls `recordBatch`; the per-run
 * document accumulates counts and flips to a terminal status when the run's
 * final batch arrives (or once `total` is reached).
 */
class ExtensionImportService {
  /**
   * Fold one batch's outcome into its import record and emit progress.
   * Non-fatal by contract: callers must never let a tracking failure break the
   * actual import, so this throws only on genuinely unexpected errors (the
   * caller wraps it).
   *
   * @param {string} userId
   * @param {object} p
   * @param {string} p.importId      client-generated run id (required)
   * @param {number} [p.importTotal] total rows the run will send
   * @param {boolean} [p.importFinal] true on the run's last batch
   * @param {{processed:number,created:number,existing:number,failed:number,error?:string}} p.batch
   */
  async recordBatch(userId, { importId, importTotal, importFinal = false, batch }) {
    const now = new Date();
    const inc = {
      processed: Number(batch.processed) || 0,
      created: Number(batch.created) || 0,
      existing: Number(batch.existing) || 0,
      failed: Number(batch.failed) || 0,
    };
    const set = { lastBatchAt: now, source: 'extension' };
    if (Number.isFinite(Number(importTotal)) && Number(importTotal) >= 0) set.total = Number(importTotal);
    if (batch.error) set.errorSummary = String(batch.error).slice(0, 1000);

    const doc = await ExtensionImport.findOneAndUpdate(
      { createdBy: userId, importId },
      {
        $inc: inc,
        $set: set,
        $setOnInsert: { startedAt: now, status: EXTENSION_IMPORT_STATUS.RUNNING },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );

    // A run completes on its final batch, or once every expected row is in.
    const reachedTotal = doc.total > 0 && doc.processed >= doc.total;
    if ((importFinal || reachedTotal) && doc.status === EXTENSION_IMPORT_STATUS.RUNNING) {
      doc.status = doc.failed > 0 ? EXTENSION_IMPORT_STATUS.PARTIAL : EXTENSION_IMPORT_STATUS.COMPLETED;
      doc.completedAt = now;
      await ExtensionImport.updateOne(
        { _id: doc._id },
        { $set: { status: doc.status, completedAt: now } },
      );
    }

    this._emit(userId, doc);
    return this._public(doc);
  }

  async listRecent(userId, limit = 10) {
    const docs = await ExtensionImport.find({ createdBy: userId })
      .sort({ startedAt: -1 })
      .limit(Math.min(50, Math.max(1, limit)))
      .lean();
    return docs.map((doc) => this._public(doc));
  }

  _emit(userId, doc) {
    try {
      global.io?.to(String(userId)).emit('extension:import:progress', this._public(doc));
    } catch (error) {
      logger.warn('Extension import progress emit failed (non-blocking)', {
        module: 'extension', action: 'import.emit', error: { message: error.message },
      });
    }
  }

  _public(doc) {
    return {
      importId: doc.importId,
      total: doc.total,
      processed: doc.processed,
      created: doc.created,
      existing: doc.existing,
      failed: doc.failed,
      status: doc.status,
      errorSummary: doc.errorSummary ?? null,
      startedAt: doc.startedAt,
      completedAt: doc.completedAt ?? null,
    };
  }
}

const extensionImportService = new ExtensionImportService();
export default extensionImportService;
