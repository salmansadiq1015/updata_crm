import { BaseWorker } from '../shared/queue/BaseWorker.js';
import eventBus from '../shared/events/EventBus.js';
import EVENT_TYPES from '../shared/events/eventTypes.js';
import logger from '../shared/logger/index.js';

/**
 * OCR processing job.
 *
 * Processes a single accounting document through OCR extraction.
 * On-demand only (triggered when a document is uploaded).
 *
 * job.data = { documentId }
 */
export class OcrProcessingWorker extends BaseWorker {
  constructor() {
    super('ocr-processing');
  }

  async process(job) {
    const { documentId } = job.data;
    const startTime = Date.now();

    // Lazy imports
    const AccountingDocument = (await import('../modules/accounting/accountingDocument.model.js')).default;
    const OcrResult = (await import('../modules/accounting/ocrResult.model.js')).default;

    const document = await AccountingDocument.findById(documentId).lean();
    if (!document) {
      logger.warn('OCR processing: document not found', {
        module: 'jobs',
        action: 'ocr-processing',
        documentId,
      });
      return { documentId, status: 'NOT_FOUND' };
    }

    // Placeholder OCR: generate mock extracted data
    const extractedData = {
      documentId,
      extractedSupplierName: 'Placeholder Supplier GmbH',
      extractedSupplierAddress: 'Musterstrasse 1, 8000 Zurich',
      extractedInvoiceNumber: `INV-${Date.now()}`,
      extractedInvoiceDate: new Date(),
      extractedDueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      extractedTotal: 1000.00,
      extractedVat: 77.00,
      extractedLineItems: [],
      confidenceScores: {
        supplierName: 0.85,
        supplierAddress: 0.85,
        invoiceNumber: 0.85,
        invoiceDate: 0.85,
        dueDate: 0.85,
        total: 0.85,
        vat: 0.85,
      },
      status: 'EXTRACTED',
    };

    // Create or update OCR result
    await OcrResult.findOneAndUpdate(
      { documentId },
      extractedData,
      { upsert: true, new: true, runValidators: true },
    );

    // Update document OCR status
    await AccountingDocument.findByIdAndUpdate(documentId, {
      ocrStatus: 'COMPLETED',
    });

    const processingTimeMs = Date.now() - startTime;

    eventBus.publish(EVENT_TYPES.ACCOUNTING_OCR_COMPLETED, {
      documentId,
      processingTimeMs,
    }, { source: 'jobs:ocr-processing' });

    logger.info('OCR processing completed', {
      module: 'jobs',
      action: 'ocr-processing',
      documentId,
      processingTimeMs,
    });

    return { documentId, processingTimeMs };
  }
}

export default OcrProcessingWorker;
