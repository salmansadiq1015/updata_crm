import auditService from '../auth/audit.service.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import logger from '../../shared/logger/index.js';
import { NotFoundError, ValidationError } from '../../shared/errors/AppError.js';

const LINE_ITEM_TEMPLATE_TYPES = new Set([
  'quotation',
  'order_confirmation',
  'invoice_standard',
  'invoice_final',
]);

const INVOICE_TEMPLATE_TYPES = new Set([
  'invoice_standard',
  'invoice_advance',
  'invoice_final',
]);

const CUSTOMER_TEMPLATE_TYPES = new Set([
  'quotation',
  'order_confirmation',
  'invoice_standard',
  'invoice_advance',
  'invoice_final',
  'service_report',
  'inspection_certificate',
]);

class DocumentGenerationService {
  async generate({ templateType, sourceModule, sourceRecordId, data, language = 'de', generatedBy, meta = {} }) {
    // 1. Find active template by type
    const DocumentTemplate = (await import('./documentTemplate.model.js')).default;
    const template = await DocumentTemplate.findOne({ templateType, isActive: true, isDeleted: false }).lean();
    if (!template) throw new NotFoundError('DocumentTemplate', `type:${templateType}`);
    if (template.approvalStatus !== 'approved') {
      throw new ValidationError('Template is not approved for document generation', [{
        field: 'approvalStatus',
        message: `Template '${templateType}' must be approved before documents can be generated (current status: ${template.approvalStatus || 'draft'})`,
      }]);
    }

    // 2. Find active CI configuration
    const CIConfiguration = (await import('./ciConfiguration.model.js')).default;
    const ciConfig = await CIConfiguration.findOne({ isActive: true }).lean();
    const { default: ciRenderAssetsService } = await import('./ciRenderAssets.service.js');
    const renderCiConfig = await ciRenderAssetsService.prepare(ciConfig);

    const renderData = this._prepareRenderData(templateType, data, renderCiConfig);
    await this._resolveLineItemImages(renderData);
    this._validateRenderData(templateType, renderData, renderCiConfig);

    // 3. Build filename
    const fileName = this._buildFilename(templateType, renderData, language);

    // 4. Generate PDF buffer
    const { buffer: pdfBuffer, pageCount } = await this._generatePdf(template, renderCiConfig, renderData, language);

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
      folderPath: this._buildFolderPath({ sourceModule, templateType, data }),
      category: templateType,
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
      pageCount,
      metadata: renderData.metadata || {},
      sourceCustomerId: this._toObjectIdOrNull(renderData.sourceCustomerId || renderData.customerId || renderData.metadata?.sourceCustomerId),
      sourceProjectId: this._toObjectIdOrNull(renderData.sourceProjectId || renderData.projectId || renderData.project?._id || renderData.metadata?.sourceProjectId),
      sourceDepartmentId: this._toObjectIdOrNull(renderData.sourceDepartmentId || renderData.departmentId || renderData.metadata?.sourceDepartmentId),
      ownerUserId: this._toObjectIdOrNull(renderData.ownerUserId || renderData.metadata?.ownerUserId || generatedBy),
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
    if (typeof renderer.renderWithMetadata === 'function') {
      return renderer.renderWithMetadata(template, ciConfig, data, language);
    }
    const buffer = await renderer.render(template, ciConfig, data, language);
    return { buffer, pageCount: 1 };
  }

  _prepareRenderData(templateType, data, ciConfig) {
    const renderData = { ...(data || {}) };
    // The generic /generate endpoint receives the raw source record (quotation, order…)
    // whose identifier field is type-specific. Normalise it to documentNumber, which the
    // renderer and payload validation expect, so quotations/orders don't 400 on generate.
    if (!renderData.documentNumber) {
      renderData.documentNumber = renderData.quotationNumber || renderData.orderNumber
        || renderData.invoiceNumber || renderData.number || undefined;
    }
    if (!INVOICE_TEMPLATE_TYPES.has(templateType) || renderData.qrBill) return renderData;

    const bankDetails = ciConfig?.companyDetails?.bankDetails || {};
    const customer = renderData.customer || {};
    // QR-bill amount: use the outstanding balance so a partially-paid invoice's
    // slip asks for what is left. But once fully paid (amountDue === 0) fall back
    // to the billed amount — net of advance deductions for a final invoice — so
    // the document can still be regenerated with a valid, non-zero QR amount.
    const billedAmount = renderData.invoiceType === 'invoice_final'
      ? Number(renderData.netBalance ?? renderData.grandTotalRounded ?? renderData.grandTotal ?? 0)
      : Number(renderData.grandTotalRounded ?? renderData.grandTotal ?? 0);
    const outstanding = Number(renderData.amountDue ?? 0);
    const amount = outstanding > 0 ? outstanding : billedAmount;
    const iban = bankDetails.qrIban || bankDetails.iban || renderData.qrIban || renderData.iban;

    renderData.qrBill = {
      iban,
      amount,
      currency: renderData.currency || 'CHF',
      reference: renderData.qrReference || renderData.documentNumber,
      debtor: customer?.name ? {
        name: customer.name,
        // Prefer the dedicated street (set when an object billing address with a c/o
        // is used) so the c/o line never lands in the QR-bill address. Falls back to
        // the existing address line — unchanged for every non-billing case.
        address: customer.qrAddress || customer.addressLine1 || '',
        zip: String(customer.plz || customer.zip || ''),
        city: customer.city || '',
        country: customer.country || 'CH',
      } : undefined,
      message: renderData.documentNumber || '',
    };

    return renderData;
  }

  /**
   * Load image bytes for line items that carry an attached product image so the
   * table renderer can embed them. Mirrors the CI logo/asset preparation:
   * resolve FileMetadata, then download the buffer from storage. Only PNG/JPEG
   * are embeddable by PDFKit — other types are skipped. Failures never abort
   * generation; the affected line simply renders without an image.
   */
  async _resolveLineItemImages(renderData) {
    const items = Array.isArray(renderData?.lineItems) ? renderData.lineItems : [];
    const withImages = items.filter((li) => li && li.image && li.image.fileId);
    if (!withImages.length) return;

    const EMBEDDABLE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg']);
    const { default: fileService } = await import('../files/file.service.js');
    const { default: storageService } = await import('../../shared/storage/StorageService.js');

    await Promise.all(withImages.map(async (li) => {
      try {
        const file = await fileService.getById(li.image.fileId);
        if (!file || !EMBEDDABLE_MIME_TYPES.has(file.mimeType)) return;
        li.imageBuffer = await storageService.download(file.key);
      } catch {
        // Non-fatal: render the line without its image rather than failing the PDF.
      }
    }));
  }

  _validateRenderData(templateType, data, ciConfig) {
    const details = [];
    const required = (field, value, message = 'Required field is missing') => {
      if (value === undefined || value === null || value === '') details.push({ field, message });
    };

    required('documentNumber', data.documentNumber);

    if (CUSTOMER_TEMPLATE_TYPES.has(templateType)) {
      required('customer.name', data.customer?.name || data.customerName);
    }

    if (LINE_ITEM_TEMPLATE_TYPES.has(templateType) && (!Array.isArray(data.lineItems) || data.lineItems.length === 0)) {
      details.push({ field: 'lineItems', message: 'At least one line item is required' });
    }

    if (INVOICE_TEMPLATE_TYPES.has(templateType)) {
      required('dueDate', data.dueDate);
      required('companyDetails.bankDetails.qrIban', ciConfig?.companyDetails?.bankDetails?.qrIban || ciConfig?.companyDetails?.bankDetails?.iban);
      required('qrBill.iban', data.qrBill?.iban);
      required('qrBill.reference', data.qrBill?.reference);
      if (!Number.isFinite(Number(data.qrBill?.amount)) || Number(data.qrBill?.amount) <= 0) {
        details.push({ field: 'qrBill.amount', message: 'QR-bill amount must be greater than zero' });
      }
    }

    if (details.length) throw new ValidationError('Document payload validation failed', details);
  }

  _buildFilename(templateType, data, _language) {
    const typeMap = {
      quotation: 'Offerte',
      order_confirmation: 'Auftragsbestätigung',
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

  _buildFolderPath({ sourceModule, templateType, data }) {
    const customerName = data.customer?.name || data.customerName || data.customer?.companyName || '';
    const projectName = data.project?.name || data.projectName || data.title || '';
    const base = projectName
      ? `Projects/${this._cleanPathSegment(projectName)}`
      : customerName
        ? `Customers/${this._cleanPathSegment(customerName)}`
        : this._cleanPathSegment(sourceModule || 'Documents');
    return `${base}/${this._cleanPathSegment(templateType || 'documents')}`;
  }

  _cleanPathSegment(value = '') {
    return `${value}`.trim().replace(/[\\/]+/g, '-').replace(/\s+/g, '_').substring(0, 80);
  }

  _toObjectIdOrNull(value) {
    if (!value) return null;
    return value._id || value.id || value;
  }
}

const documentGenerationService = new DocumentGenerationService();
export default documentGenerationService;
