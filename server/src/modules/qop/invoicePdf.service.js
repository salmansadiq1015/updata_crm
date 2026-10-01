import { createHash } from 'crypto';
import PDFDocument from 'pdfkit';
import { SwissQRBill } from 'swissqrbill/pdf';
import invoiceRepository from './invoice.repository.js';
import accountingDocumentRepository from '../accounting/accountingDocument.repository.js';
import fileService from '../files/file.service.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError } from '../../shared/errors/AppError.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';
import { buildDocumentFilename } from '../../shared/utils/documentFilename.js';

const QR_REFERENCE_TABLE = [0, 9, 4, 6, 8, 2, 7, 1, 3, 5];
const PDF_MIME_TYPE = 'application/pdf';
const BRAND_BLUE = '#102A56';
const BRAND_RED = '#e11d48';
const TEXT = '#111827';
const MUTED = '#5f6f8f';
const BORDER = '#d9dee8';

function money(value) {
  return Number(value || 0).toFixed(2);
}

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('de-CH').format(new Date(value));
}

function companyLine(...parts) {
  return parts.filter(Boolean).join(' ').trim();
}

function drawTextLogo(doc, x, y) {
  doc.save();
  doc.font('Helvetica-Bold').fontSize(29).fillColor(BRAND_BLUE).text('Updata', x, y);
  doc.fontSize(9).fillColor(BRAND_RED).text('ERP', x + 2, y + 31, { characterSpacing: 0.6 });
  doc.restore();
}

function drawCompanyHeader(doc, margin, y) {
  const pageWidth = doc.page.width;
  drawTextLogo(doc, margin, y);

  const addressLines = [
    companyLine(config.company.street, config.company.buildingNumber),
    companyLine(config.company.zip, config.company.city),
  ].filter(Boolean);
  doc.save().fontSize(8).fillColor(BRAND_BLUE);
  addressLines.forEach((line, index) => doc.text(line, margin, y + 50 + (index * 11)));

  const contactRows = [
    ['Telefon', config.company.phone],
    ['E-Mail', config.company.email],
    ['WEB', 'updata.ai'],
    ['MWST-Nr.', 'CHE-108.593.165'],
  ].filter(([, value]) => value);
  const labelX = pageWidth - margin - 134;
  const valueX = pageWidth - margin - 72;
  contactRows.forEach(([label, value], index) => {
    const rowY = y + (index * 11);
    doc.text(label, labelX, rowY, { width: 58 });
    doc.text(value, valueX, rowY, { width: 72, align: 'right' });
  });
  doc.restore();
}

function sanitizeReferenceSeed(invoiceNumber) {
  return String(invoiceNumber || '').replace(/\D/g, '').slice(-26).padStart(26, '0');
}

export function buildQrReference(invoiceNumber) {
  const payload = sanitizeReferenceSeed(invoiceNumber);
  let carry = 0;
  for (const digit of payload) {
    carry = QR_REFERENCE_TABLE[(carry + Number(digit)) % 10];
  }
  return `${payload}${(10 - carry) % 10}`;
}

function buildCreditor() {
  return {
    account: config.company.qrIban,
    name: config.company.name,
    address: config.company.street,
    buildingNumber: config.company.buildingNumber || undefined,
    zip: config.company.zip,
    city: config.company.city,
    country: config.company.country || 'CH',
  };
}

export function buildQrBillData(invoice, qrReference = buildQrReference(invoice.invoiceNumber)) {
  return {
    amount: Number(invoice.grandTotalRounded || invoice.amountDue || 0),
    creditor: buildCreditor(),
    currency: invoice.currency || 'CHF',
    reference: qrReference,
    message: invoice.invoiceNumber,
  };
}

function writeInvoiceContent(doc, invoice) {
  const margin = 48;
  const pageWidth = doc.page.width;
  const usableWidth = pageWidth - margin * 2;
  let y = 48;

  drawCompanyHeader(doc, margin, y);
  y += 105;

  doc.save().fontSize(9).fillColor(TEXT);
  doc.text(invoice.customerName, margin, y);
  if (invoice.customerAddress?.street) doc.text(invoice.customerAddress.street, margin, y + 13);
  if (invoice.customerAddress?.zip || invoice.customerAddress?.city) {
    doc.text(companyLine(invoice.customerAddress.zip, invoice.customerAddress.city), margin, y + 26);
  }
  doc.restore();

  const invoiceTitle = invoice.invoiceType === 'ADVANCE'
    ? 'Akontorechnung'
    : invoice.invoiceType === 'FINAL'
    ? 'Schlussrechnung'
    : invoice.invoiceType === 'CREDIT_NOTE'
    ? 'Gutschrift'
    : 'Rechnung';
  doc.save().fontSize(15).font('Helvetica-Bold').fillColor(BRAND_BLUE)
    .text(`${invoiceTitle} ${invoice.invoiceNumber}`, margin, y, { width: usableWidth, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor(TEXT)
    .text(`Oberwil, ${formatDate(invoice.invoiceDate)}`, margin, y + 22, { width: usableWidth, align: 'right' })
    .text(`Fällig am: ${formatDate(invoice.dueDate)}`, margin, y + 36, { width: usableWidth, align: 'right' });
  doc.restore();
  y += 82;

  if (invoice.title) {
    doc.fontSize(10).font('Helvetica-Bold').fillColor(TEXT).text(invoice.title, margin, y, { width: usableWidth });
    y += Math.max(18, doc.heightOfString(invoice.title, { width: usableWidth })) + 4;
  }

  const columns = {
    position: margin,
    code: margin + 34,
    description: margin + 92,
    quantity: margin + 316,
    unit: margin + 360,
    unitPrice: margin + 394,
    total: margin + 468,
  };

  doc.moveTo(margin, y).lineTo(pageWidth - margin, y).lineWidth(0.8).strokeColor(BORDER).stroke();
  y += 8;
  doc.fillColor(BRAND_BLUE).fontSize(8).font('Helvetica-Bold')
    .text('Nr.', columns.position, y)
    .text('Code', columns.code, y)
    .text('Text', columns.description, y)
    .text('Menge', columns.quantity, y, { width: 42, align: 'right' })
    .text('ME', columns.unit, y)
    .text('Preis', columns.unitPrice, y, { width: 58, align: 'right' })
    .text('Total', columns.total, y, { width: 48, align: 'right' });
  y += 14;
  doc.moveTo(margin, y).lineTo(pageWidth - margin, y).lineWidth(0.8).strokeColor(BORDER).stroke();
  y += 9;

  for (const item of invoice.lineItems || []) {
    if (y > 560) {
      doc.addPage();
      y = 48;
    }
    const descriptionHeight = doc.heightOfString(item.description || '', { width: 210 });
    doc.fillColor(TEXT).font('Helvetica').fontSize(8)
      .text(String(item.position || ''), columns.position, y)
      .text(item.articleNumber || '', columns.code, y, { width: 52 })
      .text(item.description || '', columns.description, y, { width: 210 })
      .text(String(item.quantity || 0), columns.quantity, y, { width: 42, align: 'right' })
      .text(item.unit || '', columns.unit, y, { width: 28 })
      .text(money(item.unitPrice), columns.unitPrice, y, { width: 58, align: 'right' })
      .text(money(item.lineTotal), columns.total, y, { width: 48, align: 'right' });
    y += Math.max(18, descriptionHeight + 8);
  }

  y += 10;
  doc.moveTo(margin, y).lineTo(pageWidth - margin, y).lineWidth(1).strokeColor(BORDER).stroke();
  y += 16;

  const totalsX = margin + 330;
  const currency = invoice.currency || 'CHF';
  doc.fontSize(9).fillColor(TEXT).font('Helvetica')
    .text('Total exkl. MWST', totalsX, y)
    .text(`${currency} ${money(invoice.subtotal)}`, totalsX, y, { width: 170, align: 'right' });
  y += 16;

  if (invoice.globalDiscountPercent > 0) {
    const pct = Number(invoice.globalDiscountPercent);
    const discountAmount = Math.round((Number(invoice.subtotal || 0) * pct / 100 + Number.EPSILON) * 100) / 100;
    const pctLabel = Number.isInteger(pct) ? String(pct) : pct.toFixed(1);
    doc.text(`Globalrabatt ${pctLabel}%`, totalsX, y)
      .text(`-${currency} ${money(discountAmount)}`, totalsX, y, { width: 170, align: 'right' });
    y += 16;
  }

  for (const vat of invoice.vatBreakdown || []) {
    doc.text(`Mehrwertsteuer ${vat.rate}%`, totalsX, y)
      .text(`${currency} ${money(vat.amount)}`, totalsX, y, { width: 170, align: 'right' });
    y += 16;
  }

  for (const deduction of invoice.advanceDeductions || []) {
    doc.text(`Abzug ${deduction.advanceInvoiceNumber}`, totalsX, y)
      .text(`-${currency} ${money(deduction.totalAmount)}`, totalsX, y, { width: 170, align: 'right' });
    y += 16;
  }

  doc.font('Helvetica-Bold').fontSize(11)
    .text('Gesamttotal inkl. MWST', totalsX, y + 4)
    .text(`${currency} ${money(invoice.grandTotalRounded)}`, totalsX, y + 4, { width: 170, align: 'right' });

  y += 42;
  doc.font('Helvetica').fontSize(9).fillColor(MUTED)
    .text(invoice.paymentTermsText || `Zahlungskondition: ${invoice.paymentTermsDays || 30} Tage netto`, margin, y, { width: usableWidth });
  y += 18;
  doc.text('Wir danken Ihnen für den geschätzten Auftrag.', margin, y, { width: usableWidth });
}

export async function generateInvoicePdfBuffer(invoice, qrReference = buildQrReference(invoice.invoiceNumber)) {
  const pdf = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true });
  const chunks = [];
  pdf.on('data', (chunk) => chunks.push(chunk));
  const finished = new Promise((resolve, reject) => {
    pdf.on('end', resolve);
    pdf.on('error', reject);
  });

  writeInvoiceContent(pdf, invoice);

  const qrBill = new SwissQRBill(buildQrBillData(invoice, qrReference), { language: 'DE' });
  qrBill.attachTo(pdf);
  pdf.end();

  await finished;

  return Buffer.concat(chunks);
}

class InvoicePdfService {
  async generateAndStore(invoiceId, userId, meta = {}) {
    const invoice = await invoiceRepository.findById(invoiceId);
    if (!invoice) throw new NotFoundError('Invoice', invoiceId);

    const qrReference = invoice.qrBillReference || buildQrReference(invoice.invoiceNumber);
    const buffer = await generateInvoicePdfBuffer(invoice, qrReference);

    // Resolve the object address for the filename convention.
    const objectAddress = await this._resolveObjectAddress(invoice.projectId);
    const templateType = invoice.invoiceType === 'ADVANCE'
      ? 'invoice_advance'
      : invoice.invoiceType === 'FINAL'
        ? 'invoice_final'
        : 'invoice_standard';
    const originalName = buildDocumentFilename({ templateType, objectAddress });

    const file = await fileService.upload({
      buffer,
      originalName,
      mimeType: PDF_MIME_TYPE,
      sizeBytes: buffer.length,
      module: 'qop',
      entityType: 'invoice',
      entityId: invoice._id,
      uploadedBy: userId,
      bucket: 'documents',
    });

    const retentionUntil = new Date();
    retentionUntil.setFullYear(retentionUntil.getFullYear() + 10);

    const accountingDocument = await accountingDocumentRepository.create({
      filePath: file.key,
      fileName: originalName,
      fileSize: buffer.length,
      mimeType: PDF_MIME_TYPE,
      fileHash: file.checksumSha256 || createHash('sha256').update(buffer).digest('hex'),
      documentType: 'AR_INVOICE_PDF',
      ocrStatus: 'NOT_APPLICABLE',
      processingStatus: 'PROCESSED',
      linkedRecords: [{ recordType: 'AR_INVOICE', recordId: invoice._id }],
      retentionUntil,
      createdBy: userId,
    });

    const updatedInvoice = await invoiceRepository.updateById(invoice._id, {
      pdfDocumentId: accountingDocument._id,
      pdfGeneratedAt: new Date(),
      qrBillReference: qrReference,
      updatedBy: userId,
    });

    auditService.logEvent({
      eventType: 'invoice.pdf_generated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { invoiceId: invoice._id, invoiceNumber: invoice.invoiceNumber, documentId: accountingDocument._id },
      module: 'qop',
    });

    logger.info('Invoice PDF generated', {
      module: 'qop',
      action: 'invoice.pdf.generate',
      invoiceId: invoice._id,
      documentId: accountingDocument._id,
    });

    return { invoice: updatedInvoice, document: accountingDocument };
  }

  async _resolveObjectAddress(projectId) {
    if (!projectId) return null;
    try {
      const mongoose = (await import('mongoose')).default;
      if (!mongoose.Types.ObjectId.isValid(String(projectId))) return null;
      const Project = (await import('../pm/project.model.js')).default;
      const project = await Project.findById(projectId).select('siteId').lean();
      if (!project?.siteId) return null;
      const Site = (await import('../crm/site.model.js')).default;
      const site = await Site.findById(project.siteId).select('street city').lean();
      if (!site?.street) return null;
      return [site.street, site.city].filter(Boolean).join(', ');
    } catch {
      return null;
    }
  }
}

const invoicePdfService = new InvoicePdfService();
export default invoicePdfService;
