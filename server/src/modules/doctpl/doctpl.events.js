import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import logger from '../../shared/logger/index.js';

async function buildQopPayload(documentType, documentId, fallbackData, fallbackLanguage) {
  if (fallbackData) {
    const templateType = fallbackData.templateType
      || (documentType === 'order' ? 'order_confirmation' : documentType);
    return {
      templateType,
      sourceModule: 'qop',
      sourceRecordId: documentId,
      data: fallbackData,
      language: fallbackLanguage || fallbackData.language || 'de',
      recipient: {
        email: fallbackData.customerEmail || fallbackData.customer?.email || null,
        name: fallbackData.customerName || fallbackData.customer?.name || '',
      },
    };
  }

  const { default: qopDocumentPayloadService } = await import('../qop/documentPayload.service.js');
  return qopDocumentPayloadService.buildPayload(documentType, documentId);
}

/**
 * DocTpl domain event handlers.
 *
 * Subscribes to cross-cutting events that trigger document generation
 * and email delivery. All handlers are defensive — errors are logged
 * but never re-thrown to avoid breaking the publisher.
 */
export function registerDoctplEvents() {
  // --- QUOTATION_SENT ---
  // Generate quotation PDF and send to customer.
  eventBus.on(EVENT_TYPES.QUOTATION_SENT, async (event) => {
    try {
      const { quotationId, customerId, customerEmail, data, language } = event.payload;
      const payload = await buildQopPayload('quotation', quotationId, data, language);

      const { default: documentGenerationService } = await import('./documentGeneration.service.js');
      const { default: emailService } = await import('./email.service.js');

      // Generate quotation PDF
      const doc = await documentGenerationService.generate({
        templateType: payload.templateType,
        sourceModule: payload.sourceModule,
        sourceRecordId: payload.sourceRecordId,
        data: payload.data,
        language: payload.language,
        generatedBy: event.payload.sentBy || event.payload.createdBy || event.payload.userId,
        meta: { ipAddress: 'internal' },
      });

      // Compose and send email if customer email is available
      const recipientEmail = customerEmail || payload.recipient.email;
      if (recipientEmail) {
        const composed = await emailService.compose({
          templateType: 'quotation',
          language: payload.language,
          data: { ...payload.data, customerEmail: recipientEmail },
          documentId: doc._id,
        });

        await emailService.send({
          to: composed.to?.length ? composed.to : [recipientEmail],
          subject: composed.subject,
          bodyHtml: composed.bodyHtml,
          bodyText: composed.bodyText,
          documentId: doc._id,
          sourceModule: 'qop',
          sourceRecordId: quotationId,
          createdBy: event.payload.sentBy || event.payload.createdBy || event.payload.userId,
        });
      }

      logger.info('Quotation PDF generated and email queued via QUOTATION_SENT', {
        module: 'doctpl',
        action: 'event.quotation_sent',
        quotationId,
        customerId,
        documentId: doc._id,
      });
    } catch (err) {
      logger.error('Failed to handle QUOTATION_SENT event in doctpl', {
        module: 'doctpl',
        action: 'event.quotation_sent',
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  // --- ORDER_CONFIRMED ---
  // Generate order confirmation PDF.
  eventBus.on(EVENT_TYPES.ORDER_CONFIRMED, async (event) => {
    try {
      const { orderId, data, language } = event.payload;
      const payload = await buildQopPayload('order', orderId, data, language);

      const { default: documentGenerationService } = await import('./documentGeneration.service.js');

      const doc = await documentGenerationService.generate({
        templateType: payload.templateType,
        sourceModule: payload.sourceModule,
        sourceRecordId: payload.sourceRecordId,
        data: payload.data,
        language: payload.language,
        generatedBy: event.payload.confirmedBy || event.payload.createdBy || event.payload.userId,
        meta: { ipAddress: 'internal' },
      });

      const Order = (await import('../qop/order.model.js')).default;
      await Order.updateOne(
        { _id: orderId, isDeleted: { $ne: true } },
        { $set: { orderConfirmationDocId: doc._id } },
      );

      logger.info('Order confirmation PDF generated via ORDER_CONFIRMED', {
        module: 'doctpl',
        action: 'event.order_confirmed',
        orderId,
        documentId: doc._id,
      });
    } catch (err) {
      logger.error('Failed to handle ORDER_CONFIRMED event in doctpl', {
        module: 'doctpl',
        action: 'event.order_confirmed',
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  // --- INVOICE_FINALIZED ---
  // Generate invoice PDF.
  eventBus.on(EVENT_TYPES.INVOICE_FINALIZED, async (event) => {
    try {
      const { invoiceId, invoiceType, data, language } = event.payload;
      const payload = await buildQopPayload('invoice', invoiceId, data, language);

      const { default: documentGenerationService } = await import('./documentGeneration.service.js');

      // Map invoice type to template type
      const templateType = invoiceType || payload.templateType || 'invoice_standard';

      const doc = await documentGenerationService.generate({
        templateType,
        sourceModule: payload.sourceModule,
        sourceRecordId: payload.sourceRecordId,
        data: payload.data,
        language: payload.language,
        generatedBy: event.payload.finalizedBy || event.payload.createdBy || event.payload.userId,
        meta: { ipAddress: 'internal' },
      });

      logger.info('Invoice PDF generated via INVOICE_FINALIZED', {
        module: 'doctpl',
        action: 'event.invoice_finalized',
        invoiceId,
        documentId: doc._id,
      });
    } catch (err) {
      logger.error('Failed to handle INVOICE_FINALIZED event in doctpl', {
        module: 'doctpl',
        action: 'event.invoice_finalized',
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  // --- INVOICE_SENT ---
  // Send invoice email with PDF attachment.
  eventBus.on(EVENT_TYPES.INVOICE_SENT, async (event) => {
    try {
      const { invoiceId, customerEmail, documentId, data, language } = event.payload;

      if (!customerEmail) return;

      const { default: emailService } = await import('./email.service.js');

      const composed = await emailService.compose({
        templateType: data?.invoiceType || 'invoice_standard',
        language: language || 'de',
        data: { ...data, customerEmail },
        documentId,
      });

      await emailService.send({
        to: composed.to?.length ? composed.to : [customerEmail],
        subject: composed.subject,
        bodyHtml: composed.bodyHtml,
        bodyText: composed.bodyText,
        documentId,
        sourceModule: 'qop',
        sourceRecordId: invoiceId,
        createdBy: event.payload.sentBy || event.payload.createdBy,
      });

      logger.info('Invoice email queued via INVOICE_SENT', {
        module: 'doctpl',
        action: 'event.invoice_sent',
        invoiceId,
        documentId,
      });
    } catch (err) {
      logger.error('Failed to handle INVOICE_SENT event in doctpl', {
        module: 'doctpl',
        action: 'event.invoice_sent',
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  logger.info('DocTpl event handlers registered', { module: 'doctpl', action: 'events.register' });
}

export default registerDoctplEvents;
