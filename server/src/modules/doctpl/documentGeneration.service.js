import auditService from '../auth/audit.service.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import logger from '../../shared/logger/index.js';
import { NotFoundError } from '../../shared/errors/AppError.js';

class DocumentGenerationService {
  async generate({ templateType, sourceModule, sourceRecordId, data, language = 'de', generatedBy, meta = {} }) {
    // 1. Find active template by type
    const DocumentTemplate = (await import('./documentTemplate.model.js')).default;
    const template = await DocumentTemplate.findOne({ templateType, isActive: true, isDeleted: false }).lean();
    if (!template) throw new NotFoundError('DocumentTemplate', `type:${templateType}`);

    // 2. Find active CI configuration
    const CIConfiguration = (await import('./ciConfiguration.model.js')).default;
    const ciConfig = await CIConfiguration.findOne({ isActive: true }).lean();

    // 3. Build filename
    const fileName = this._buildFilename(templateType, data, language);

    // 4. Generate PDF buffer
    const pdfBuffer = await this._generatePdf(template, ciConfig, data, language);

    // 5. Upload PDF via file service
    const { default: fileService } = await import('../files/file.service.js');
    const fileMeta = await fileService.upload({
      buffer: pdfBuffer,
      originalName: fileName,
      mimeType: 'application/pdf',
      sizeBytes: pdfBuffer.length,
      module: 'doctpl',
      entityType: templateType,
      entityId: sourceRecordId,
      uploadedBy: generatedBy,
      bucket: 'documents',
    });

    // 6. Create GeneratedDocument record
    const { default: generatedDocumentRepository } = await import('./generatedDocument.repository.js');
    const generatedDocument = await generatedDocumentRepository.create({
      templateId: template._id,
      templateVersion: template.currentVersion,
      documentType: templateType,
      sourceModule,
      sourceRecordId,
      language,
      fileId: fileMeta._id,
      fileName,
      fileSizeBytes: pdfBuffer.length,
      pageCount: 1,
      metadata: data.metadata || {},
      generatedBy,
    });

    // 7. Publish event
    eventBus.publish(EVENT_TYPES.DOCUMENT_TPL_GENERATED, {
      documentId: generatedDocument._id,
      templateType,
      sourceModule,
      sourceRecordId,
      generatedBy,
    }, { source: 'doctpl:generation' });

    // 8. Audit log
    auditService.logEvent({
      eventType: 'document.generated',
      userId: generatedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: {
        documentId: generatedDocument._id,
        templateType,
        sourceModule,
        sourceRecordId,
        fileName,
      },
      module: 'doctpl',
    });

    logger.info('Document generated', {
      module: 'doctpl',
      action: 'generate',
      documentId: generatedDocument._id,
      templateType,
      sourceModule,
      sourceRecordId,
    });

    return generatedDocument;
  }

  async _generatePdf(template, ciConfig, data, language) {
    // Phase 1: Basic PDF using PDFKit
    // Phase 2: Full Handlebars + Puppeteer rendering
    const PDFDocument = (await import('pdfkit')).default;

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(16).fillColor('#1B3F8B')
        .text(ciConfig?.companyName || 'MB Boiler & Heizung AG', { align: 'left' });
      doc.moveDown(0.5);
      doc.fontSize(8).fillColor('#666666')
        .text(ciConfig?.companyDetails?.address?.street || '');
      doc.text(
        `${ciConfig?.companyDetails?.address?.zip || ''} ${ciConfig?.companyDetails?.address?.city || ''}`,
      );
      doc.moveDown(1);

      // Document title
      const titles = {
        quotation: 'Offerte',
        order_confirmation: 'Auftragsbestaetigung',
        invoice_standard: 'Rechnung',
        invoice_advance: 'Akontorechnung',
        invoice_final: 'Schlussrechnung',
        cover_letter: 'Begleitschreiben',
        service_report: 'Servicebericht',
        inspection_certificate: 'Inspektionszertifikat',
      };
      doc.fontSize(14).fillColor('#1B3F8B')
        .text(titles[template.templateType] || template.templateType);
      doc.moveDown(0.5);

      // Document number + date
      if (data.documentNumber) {
        doc.fontSize(10).fillColor('#1A1A1A').text(`Nr: ${data.documentNumber}`);
      }
      if (data.documentDate) {
        doc.text(`Datum: ${data.documentDate}`);
      }
      doc.moveDown(0.5);

      // Customer
      if (data.customer?.name) {
        doc.text(data.customer.name);
        if (data.customer.addressLine1) doc.text(data.customer.addressLine1);
        if (data.customer.plz && data.customer.city) {
          doc.text(`${data.customer.plz} ${data.customer.city}`);
        }
      }
      doc.moveDown(1);

      // Introduction
      if (data.introduction) {
        doc.fontSize(10).text(data.introduction);
        doc.moveDown(0.5);
      }

      // Line items table (simple)
      if (data.lineItems?.length) {
        const tableTop = doc.y;
        doc.fontSize(9).fillColor('#1B3F8B');
        doc.text('Pos.', 50, tableTop, { width: 30 });
        doc.text('Beschreibung', 80, tableTop, { width: 250 });
        doc.text('Menge', 330, tableTop, { width: 50, align: 'right' });
        doc.text('Preis', 380, tableTop, { width: 70, align: 'right' });
        doc.text('Total', 450, tableTop, { width: 70, align: 'right' });
        doc.moveDown(0.3);
        doc.strokeColor('#CCCCCC').lineWidth(0.5)
          .moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.moveDown(0.3);

        doc.fillColor('#1A1A1A');
        for (const item of data.lineItems) {
          if (item.type === 'text') {
            doc.text(item.description || '', 50);
            doc.moveDown(0.3);
            continue;
          }
          const y = doc.y;
          doc.text(String(item.position || ''), 50, y, { width: 30 });
          doc.text(item.description || '', 80, y, { width: 250 });
          doc.text(String(item.quantity || ''), 330, y, { width: 50, align: 'right' });
          doc.text(
            item.unitPrice != null ? item.unitPrice.toFixed(2) : '',
            380, y, { width: 70, align: 'right' },
          );
          const lineTotal = item.total != null
            ? item.total.toFixed(2)
            : (item.lineTotal != null ? item.lineTotal.toFixed(2) : '');
          doc.text(lineTotal, 450, y, { width: 70, align: 'right' });
          doc.moveDown(0.3);
        }
      }

      // Totals
      doc.moveDown(0.5);
      doc.strokeColor('#CCCCCC').lineWidth(0.5)
        .moveTo(350, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.3);

      if (data.subtotal != null) {
        doc.fontSize(10).text(`Zwischensumme: CHF ${data.subtotal.toFixed(2)}`, { align: 'right' });
      }
      if (data.vatBreakdown?.length) {
        for (const vat of data.vatBreakdown) {
          doc.text(`MwSt. ${(vat.rate * 100).toFixed(1)}%: CHF ${vat.amount.toFixed(2)}`, { align: 'right' });
        }
      }
      if (data.grandTotalRounded != null) {
        doc.fontSize(12).fillColor('#1B3F8B')
          .text(`Gesamtbetrag: CHF ${data.grandTotalRounded.toFixed(2)}`, { align: 'right' });
      } else if (data.grandTotal != null) {
        doc.fontSize(12).fillColor('#1B3F8B')
          .text(`Gesamtbetrag: CHF ${data.grandTotal.toFixed(2)}`, { align: 'right' });
      }

      // Footer
      doc.fontSize(8).fillColor('#666666');
      const pageHeight = doc.page.height;
      doc.text(
        `${ciConfig?.companyName || 'MB Boiler & Heizung AG'} | ${ciConfig?.companyDetails?.vatNumber || ''}`,
        50,
        pageHeight - 50,
        { align: 'center' },
      );

      doc.end();
    });
  }

  _buildFilename(templateType, data, language) {
    const typeMap = {
      quotation: 'Offerte',
      order_confirmation: 'Auftragsbestaetigung',
      invoice_standard: 'Rechnung',
      invoice_advance: 'Akontorechnung',
      invoice_final: 'Schlussrechnung',
      cover_letter: 'Begleitschreiben',
      service_report: 'Servicebericht',
      inspection_certificate: 'Inspektionszertifikat',
    };
    const typeName = typeMap[templateType] || templateType;
    const docNum = data.documentNumber || 'DRAFT';
    const custName = (data.customer?.name || '').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
    const dateStr = new Date().toISOString().split('T')[0];
    return `${typeName}_${docNum}_${custName}_${dateStr}.pdf`;
  }
}

const documentGenerationService = new DocumentGenerationService();
export default documentGenerationService;
