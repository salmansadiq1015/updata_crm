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
    const ocrResultRepository = (await import('../modules/accounting/ocrResult.repository.js')).default;
    const fileService = (await import('../modules/files/file.service.js')).default;
    const ocrProviderService = (await import('../modules/accounting/ocrProvider.service.js')).default;

    const document = await AccountingDocument.findById(documentId).lean();
    if (!document) {
      logger.warn('OCR processing: document not found', {
        module: 'jobs',
        action: 'ocr-processing',
        documentId,
      });
      return { documentId, status: 'NOT_FOUND' };
    }

    try {
      await AccountingDocument.findByIdAndUpdate(documentId, {
        ocrStatus: 'PROCESSING',
        processingStatus: 'UNPROCESSED',
      });

      const buffer = await fileService.downloadBuffer(document.filePath);
      const extraction = await ocrProviderService.extract({ document, buffer });
      const processingTimeMs = Date.now() - startTime;

      await ocrResultRepository.upsertByDocumentId(documentId, {
        extractedSupplierName: extraction.fields.supplierName,
        extractedSupplierAddress: extraction.fields.supplierAddress,
        extractedInvoiceNumber: extraction.fields.invoiceNumber,
        extractedInvoiceDate: extraction.fields.invoiceDate,
        extractedDueDate: extraction.fields.dueDate,
        extractedTotal: extraction.fields.total,
        extractedVat: extraction.fields.vat,
        extractedLineItems: extraction.fields.lineItems,
        provider: extraction.provider,
        rawText: extraction.rawText || '',
        rawPayload: extraction.rawPayload,
        confidenceScores: extraction.confidenceScores,
        lowConfidenceFields: extraction.lowConfidenceFields,
        status: 'EXTRACTED',
        errorMessage: '',
        processingTimeMs,
      });

      await AccountingDocument.findByIdAndUpdate(documentId, {
        ocrStatus: 'COMPLETED',
        processingStatus: 'IN_REVIEW',
        fullText: extraction.rawText || '',
      });

      eventBus.publish(EVENT_TYPES.ACCOUNTING_OCR_COMPLETED, {
        documentId,
        processingTimeMs,
        lowConfidenceFields: extraction.lowConfidenceFields,
      }, { source: 'jobs:ocr-processing' });

      logger.info('OCR processing completed', {
        module: 'jobs',
        action: 'ocr-processing',
        documentId,
        processingTimeMs,
        lowConfidenceFields: extraction.lowConfidenceFields,
      });

      return { documentId, processingTimeMs, lowConfidenceFields: extraction.lowConfidenceFields };
    } catch (err) {
      const processingTimeMs = Date.now() - startTime;
      await ocrResultRepository.upsertByDocumentId(documentId, {
        confidenceScores: {},
        lowConfidenceFields: [],
        status: 'REJECTED',
        errorMessage: err.message,
        processingTimeMs,
      });
      await AccountingDocument.findByIdAndUpdate(documentId, {
        ocrStatus: 'FAILED',
        processingStatus: 'UNPROCESSED',
      });
      throw err;
    }
  }
}

export default OcrProcessingWorker;
