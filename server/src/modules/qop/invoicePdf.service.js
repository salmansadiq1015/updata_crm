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

const QR_REFERENCE_TABLE = [0, 9, 4, 6, 8, 2, 7, 1, 3, 5];
const PDF_MIME_TYPE = 'application/pdf';

function money(value) {
  return Number(value || 0).toFixed(2);
}

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('de-CH').format(new Date(value));
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

  doc.fontSize(18).font('Helvetica-Bold').text(config.company.name, margin, y);
  doc.fontSize(9).font('Helvetica').text(
    `${config.company.street} ${config.company.buildingNumber || ''}, ${config.company.zip} ${config.company.city}`,
    margin,
    y + 24,
  );
  if (config.company.email || config.company.phone) {
    doc.text([config.company.email, config.company.phone].filter(Boolean).join(' | '), margin, y + 38);
  }

  doc.fontSize(16).font('Helvetica-Bold').text('Rechnung', margin, y, { width: usableWidth, align: 'right' });
  doc.fontSize(9).font('Helvetica').text(invoice.invoiceNumber, margin, y + 24, { width: usableWidth, align: 'right' });
  y += 82;

  doc.moveTo(margin, y).lineTo(pageWidth - margin, y).lineWidth(1).strokeColor('#d9d9d9').stroke();
  y += 24;

  doc.fontSize(9).fillColor('#6b7280').text('Rechnung an', margin, y);
  doc.fillColor('#111827').fontSize(11).font('Helvetica-Bold').text(invoice.customerName, margin, y + 16);
  doc.font('Helvetica').fontSize(9)
    .text(`Rechnungsdatum: ${formatDate(invoice.invoiceDate)}`, margin, y + 16, { width: usableWidth, align: 'right' })
    .text(`Faellig am: ${formatDate(invoice.dueDate)}`, margin, y + 30, { width: usableWidth, align: 'right' });
  y += 72;

  const columns = {
    position: margin,
    description: margin + 42,
    quantity: margin + 310,
    unitPrice: margin + 370,
    total: margin + 455,
  };

  doc.rect(margin, y, usableWidth, 22).fill('#f3f4f6');
  doc.fillColor('#374151').fontSize(8).font('Helvetica-Bold')
    .text('Pos.', columns.position, y + 7)
    .text('Beschreibung', columns.description, y + 7)
    .text('Menge', columns.quantity, y + 7)
    .text('Preis', columns.unitPrice, y + 7)
    .text('Total', columns.total, y + 7, { width: 90, align: 'right' });
  y += 28;

  for (const item of invoice.lineItems || []) {
    if (y > 560) {
      doc.addPage();
      y = 48;
    }
    doc.fillColor('#111827').font('Helvetica').fontSize(8)
      .text(String(item.position || ''), columns.position, y)
      .text(item.description || '', columns.description, y, { width: 250 })
      .text(`${item.quantity || 0} ${item.unit || ''}`, columns.quantity, y)
      .text(`${invoice.currency || 'CHF'} ${money(item.unitPrice)}`, columns.unitPrice, y)
      .text(`${invoice.currency || 'CHF'} ${money(item.lineTotal)}`, columns.total, y, { width: 90, align: 'right' });
    y += Math.max(18, doc.heightOfString(item.description || '', { width: 250 }) + 8);
  }

  y += 10;
  doc.moveTo(margin, y).lineTo(pageWidth - margin, y).lineWidth(1).strokeColor('#e5e7eb').stroke();
  y += 16;

  const totalsX = margin + 330;
  doc.fontSize(9).fillColor('#111827').font('Helvetica')
    .text('Zwischentotal', totalsX, y)
    .text(`${invoice.currency || 'CHF'} ${money(invoice.subtotal)}`, totalsX, y, { width: 170, align: 'right' });
  y += 16;

  for (const vat of invoice.vatBreakdown || []) {
    doc.text(`MWST ${vat.rate}%`, totalsX, y)
      .text(`${invoice.currency || 'CHF'} ${money(vat.amount)}`, totalsX, y, { width: 170, align: 'right' });
    y += 16;
  }

  doc.font('Helvetica-Bold').fontSize(11)
    .text('Rechnungstotal', totalsX, y + 4)
    .text(`${invoice.currency || 'CHF'} ${money(invoice.grandTotalRounded)}`, totalsX, y + 4, { width: 170, align: 'right' });
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
    const originalName = `Rechnung_${invoice.invoiceNumber}.pdf`;

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
}

const invoicePdfService = new InvoicePdfService();
export default invoicePdfService;
