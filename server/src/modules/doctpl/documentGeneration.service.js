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
    const { DocumentRenderer } = await import('./renderer/index.js');
    const renderer = new DocumentRenderer();
    return renderer.render(template, ciConfig, data, language);
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
