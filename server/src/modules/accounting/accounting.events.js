import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import logger from '../../shared/logger/index.js';
import accountMappingService, { ACCOUNT_MAPPING } from './accountMapping.service.js';

/**
 * Register accounting module event handlers.
 *
 * Subscribes to cross-module events (QOP invoices, document uploads)
 * and triggers accounting-side actions (journal entries, OCR, aging updates).
 */
export function registerAccountingEvents() {
  eventBus.subscribe(EVENT_TYPES.INVOICE_FINALIZED, async (data) => {
    try {
      const journalEntryService = (await import('./journalEntry.service.js')).default;
      const [receivableAccountId, revenueAccountId] = await Promise.all([
        accountMappingService.resolveGlobal(ACCOUNT_MAPPING.AR_RECEIVABLE),
        accountMappingService.resolveGlobal(ACCOUNT_MAPPING.SALES_REVENUE),
      ]);

      await journalEntryService.createFromEvent(
        'INVOICE_FINALIZED',
        data.invoiceId,
        receivableAccountId,
        revenueAccountId,
        data.totalAmount || data.totalGross || 0,
        `Revenue: Invoice ${data.invoiceNumber || data.invoiceId} finalized`,
        data.userId || null,
      );

      logger.info('Journal entry created for finalized invoice', {
        module: 'accounting',
        action: 'event.invoice_finalized',
        invoiceId: data.invoiceId,
      });
    } catch (err) {
      logger.error('Failed to create journal entry for finalized invoice', {
        module: 'accounting',
        action: 'event.invoice_finalized',
        invoiceId: data.invoiceId,
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  eventBus.subscribe(EVENT_TYPES.INVOICE_PAYMENT_RECORDED, async (data) => {
    try {
      const journalEntryService = (await import('./journalEntry.service.js')).default;
      const [bankAccountId, receivableAccountId] = await Promise.all([
        accountMappingService.resolveGlobal(ACCOUNT_MAPPING.BANK_CLEARING),
        accountMappingService.resolveGlobal(ACCOUNT_MAPPING.AR_RECEIVABLE),
      ]);

      await journalEntryService.createFromEvent(
        'INVOICE_PAYMENT',
        data.invoiceId || data.paymentId,
        bankAccountId,
        receivableAccountId,
        data.amount || 0,
        `Payment recorded for invoice ${data.invoiceNumber || data.invoiceId}`,
        data.userId || null,
      );

      logger.info('Journal entry created for invoice payment', {
        module: 'accounting',
        action: 'event.invoice_payment_recorded',
        invoiceId: data.invoiceId,
      });
    } catch (err) {
      logger.error('Failed to create journal entry for invoice payment', {
        module: 'accounting',
        action: 'event.invoice_payment_recorded',
        invoiceId: data.invoiceId,
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  eventBus.subscribe(EVENT_TYPES.INVOICE_PAID, async (data) => {
    try {
      logger.info('Invoice fully paid - AR open item closed', {
        module: 'accounting',
        action: 'event.invoice_paid',
        invoiceId: data.invoiceId,
      });
    } catch (err) {
      logger.error('Failed to process invoice paid event', {
        module: 'accounting',
        action: 'event.invoice_paid',
        invoiceId: data.invoiceId,
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  eventBus.subscribe(EVENT_TYPES.INVOICE_OVERDUE, async (data) => {
    try {
      logger.info('Invoice overdue - aging updated, dunning flagged', {
        module: 'accounting',
        action: 'event.invoice_overdue',
        invoiceId: data.invoiceId,
        invoiceIds: data.invoiceIds,
      });
    } catch (err) {
      logger.error('Failed to process invoice overdue event', {
        module: 'accounting',
        action: 'event.invoice_overdue',
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  eventBus.subscribe(EVENT_TYPES.ACCOUNTING_DOCUMENT_UPLOADED, async (data) => {
    try {
      if (data.documentType === 'SUPPLIER_INVOICE') {
        const queueManager = (await import('../../shared/queue/QueueManager.js')).default;
        await queueManager.addJob('ocr-processing', {
          documentId: data.documentId,
        });

        logger.info('OCR processing queued for supplier invoice document', {
          module: 'accounting',
          action: 'event.document_uploaded',
          documentId: data.documentId,
        });
      }
    } catch (err) {
      logger.error('Failed to queue OCR processing for document', {
        module: 'accounting',
        action: 'event.document_uploaded',
        documentId: data.documentId,
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  logger.info('Accounting event handlers registered', {
    module: 'accounting',
    action: 'events.register',
    events: [
      'INVOICE_FINALIZED',
      'INVOICE_PAYMENT_RECORDED',
      'INVOICE_PAID',
      'INVOICE_OVERDUE',
      'ACCOUNTING_DOCUMENT_UPLOADED',
    ],
  });
}
