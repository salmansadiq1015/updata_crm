import { createHash } from 'crypto';
import PDFDocument from 'pdfkit';
import accountingDocumentRepository from './accountingDocument.repository.js';
import fileService from '../files/file.service.js';
import auditService from '../auth/audit.service.js';
import sendMail from '../../shared/mail/mail.js';
import { AppError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

const PDF_MIME_TYPE = 'application/pdf';

function money(value, currency = 'CHF') {
  return `${currency} ${Number(value || 0).toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('de-CH').format(new Date(value));
}

function stripHtml(value = '') {
  return String(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function getPath(data, path) {
  return String(path).split('.').reduce((current, part) => current?.[part], data);
}

function renderTemplate(template, data) {
  return String(template || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const value = getPath(data, path);
    return value === undefined || value === null ? '' : String(value);
  });
}

async function buildPdfBuffer(writeContent) {
  const pdf = new PDFDocument({ size: 'A4', margin: 48, autoFirstPage: true });
  const chunks = [];
  pdf.on('data', (chunk) => chunks.push(chunk));
  const finished = new Promise((resolve, reject) => {
    pdf.on('end', resolve);
    pdf.on('error', reject);
  });

  writeContent(pdf);
  pdf.end();
  await finished;

  return Buffer.concat(chunks);
}

function writeCompanyHeader(pdf, title, subtitle) {
  const rightX = 360;
  pdf.font('Helvetica-Bold').fontSize(16).text(config.company?.name || 'Updata', 48, 44);
  pdf.font('Helvetica').fontSize(8).fillColor('#4b5563')
    .text(
      [
        config.company?.street,
        config.company?.buildingNumber,
        config.company?.zip,
        config.company?.city,
      ].filter(Boolean).join(' '),
      48,
      66,
    )
    .text([config.company?.email, config.company?.phone].filter(Boolean).join(' | '), 48, 78);

  pdf.fillColor('#111827').font('Helvetica-Bold').fontSize(14).text(title, rightX, 44, { width: 185, align: 'right' });
  if (subtitle) {
    pdf.font('Helvetica').fontSize(8).fillColor('#4b5563').text(subtitle, rightX, 66, { width: 185, align: 'right' });
  }
  pdf.strokeColor('#e5e7eb').moveTo(48, 100).lineTo(547, 100).stroke();
  pdf.fillColor('#111827');
}

function addTableHeader(pdf, y, columns) {
  pdf.rect(48, y, 499, 20).fill('#f3f4f6');
  pdf.fillColor('#374151').font('Helvetica-Bold').fontSize(7);
  for (const col of columns) {
    pdf.text(col.label, col.x, y + 7, { width: col.width, align: col.align || 'left' });
  }
  pdf.fillColor('#111827');
}

function ensurePage(pdf, y, minSpace = 48) {
  if (y + minSpace <= 760) return y;
  pdf.addPage();
  return 48;
}

function linkedRecordsFromItems(statement) {
  return (statement.items || [])
    .filter((item) => item.recordId)
    .map((item) => ({
      recordType: item.type === 'AP_INVOICE' ? 'AP_INVOICE' : 'AR_INVOICE',
      recordId: item.recordId,
    }));
}

function statementFullText(statement) {
  return [
    `${statement.entityType} statement`,
    statement.entityName,
    statement.dateFrom,
    statement.dateTo,
    ...(statement.items || []).map((item) => [
      item.type,
      item.reference,
      item.description,
      item.status,
      item.debit,
      item.credit,
      item.balance,
    ].join(' ')),
  ].filter(Boolean).join('\n');
}

export async function generateStatementPdfBuffer(statement) {
  return buildPdfBuffer((pdf) => {
    writeCompanyHeader(
      pdf,
      statement.entityType === 'supplier' ? 'Lieferantenkontoauszug' : 'Kundenkontoauszug',
      `Erstellt am ${formatDate(statement.generatedAt)}`,
    );

    let y = 124;
    pdf.font('Helvetica-Bold').fontSize(11).text(statement.entityName || statement.entityId, 48, y);
    pdf.font('Helvetica').fontSize(8).fillColor('#4b5563')
      .text(`Zeitraum: ${formatDate(statement.dateFrom)} - ${formatDate(statement.dateTo)}`, 48, y + 16);
    y += 46;

    const columns = [
      { label: 'Datum', x: 52, width: 58 },
      { label: 'Typ', x: 114, width: 70 },
      { label: 'Referenz', x: 188, width: 86 },
      { label: 'Text', x: 278, width: 115 },
      { label: 'Soll', x: 396, width: 45, align: 'right' },
      { label: 'Haben', x: 444, width: 45, align: 'right' },
      { label: 'Saldo', x: 492, width: 50, align: 'right' },
    ];
    addTableHeader(pdf, y, columns);
    y += 28;

    pdf.font('Helvetica').fontSize(7).fillColor('#111827');
    for (const item of statement.items || []) {
      y = ensurePage(pdf, y, 28);
      pdf.text(formatDate(item.date), columns[0].x, y, { width: columns[0].width })
        .text(item.type, columns[1].x, y, { width: columns[1].width })
        .text(item.reference || '-', columns[2].x, y, { width: columns[2].width })
        .text(item.description || '', columns[3].x, y, { width: columns[3].width })
        .text(item.debit ? money(item.debit, statement.currency) : '-', columns[4].x, y, { width: columns[4].width, align: 'right' })
        .text(item.credit ? money(item.credit, statement.currency) : '-', columns[5].x, y, { width: columns[5].width, align: 'right' })
        .text(money(item.balance, statement.currency), columns[6].x, y, { width: columns[6].width, align: 'right' });
      y += Math.max(20, pdf.heightOfString(item.description || '', { width: columns[3].width }) + 8);
    }

    y = ensurePage(pdf, y, 70);
    pdf.strokeColor('#e5e7eb').moveTo(48, y).lineTo(547, y).stroke();
    y += 16;
    pdf.font('Helvetica-Bold').fontSize(9)
      .text('Total Soll', 360, y)
      .text(money(statement.totalDebit, statement.currency), 440, y, { width: 100, align: 'right' });
    y += 16;
    pdf.text('Total Haben', 360, y)
      .text(money(statement.totalCredit, statement.currency), 440, y, { width: 100, align: 'right' });
    y += 16;
    pdf.text('Offener Saldo', 360, y)
      .text(money(statement.closingBalance, statement.currency), 440, y, { width: 100, align: 'right' });
  });
}

export async function generateDunningPdfBuffer(letter) {
  return buildPdfBuffer((pdf) => {
    writeCompanyHeader(pdf, `Mahnung Stufe ${letter.level}`, letter.invoiceNumber);
    let y = 132;

    pdf.font('Helvetica-Bold').fontSize(11).text(letter.customerName || 'Kunde', 48, y);
    y += 34;
    pdf.font('Helvetica').fontSize(9)
      .text(`Rechnung: ${letter.invoiceNumber}`, 48, y)
      .text(`Fällig am: ${formatDate(letter.dueDate)}`, 48, y + 14)
      .text(`Offener Betrag: ${money(letter.amountDue, letter.currency)}`, 48, y + 28)
      .text(`Mahngebühr: ${money(letter.feeAmount || 0, letter.currency)}`, 48, y + 42);
    y += 76;

    pdf.font('Helvetica-Bold').fontSize(12).text(letter.subject, 48, y);
    y += 28;
    pdf.font('Helvetica').fontSize(9).text(stripHtml(letter.bodyHtml), 48, y, {
      width: 499,
      lineGap: 4,
    });
  });
}

class AccountingDocumentOutputService {
  async storePdf({ buffer, fileName, documentType, linkedRecords, fullText, userId, entityType, entityId, notes }) {
    const file = await fileService.upload({
      buffer,
      originalName: fileName,
      mimeType: PDF_MIME_TYPE,
      sizeBytes: buffer.length,
      module: 'accounting',
      entityType,
      entityId,
      uploadedBy: userId,
      bucket: 'documents',
    });

    const retentionUntil = new Date();
    retentionUntil.setFullYear(retentionUntil.getFullYear() + 10);

    return accountingDocumentRepository.create({
      filePath: file.key,
      fileName,
      fileSize: buffer.length,
      mimeType: PDF_MIME_TYPE,
      fileHash: file.checksumSha256 || createHash('sha256').update(buffer).digest('hex'),
      documentType,
      ocrStatus: 'NOT_APPLICABLE',
      processingStatus: 'PROCESSED',
      notes: notes || '',
      fullText: fullText || '',
      linkedRecords: linkedRecords || [],
      retentionUntil,
      createdBy: userId,
    });
  }

  async createStatementOutput(statement, options, userId, meta = {}) {
    if (options.sendEmail && !options.recipientEmail) {
      throw new AppError('recipientEmail is required when sendEmail is true', 400, ERROR_CODES.INVALID_INPUT);
    }

    const buffer = await generateStatementPdfBuffer(statement);
    const safeEntity = String(statement.entityName || statement.entityId).replace(/[^\w.-]+/g, '_').slice(0, 80);
    const fileName = `Kontoauszug_${statement.entityType}_${safeEntity}_${new Date().toISOString().slice(0, 10)}.pdf`;
    const document = await this.storePdf({
      buffer,
      fileName,
      documentType: 'OPEN_ITEM_STATEMENT',
      linkedRecords: linkedRecordsFromItems(statement),
      fullText: statementFullText(statement),
      userId,
      entityType: 'statement',
      entityId: statement.entityId,
      notes: `Statement for ${statement.entityType} ${statement.entityName || statement.entityId}`,
    });

    let email = null;
    if (options.sendEmail) {
      email = await sendMail({
        email: options.recipientEmail,
        subject: `Kontoauszug - ${config.company?.name || 'Updata'}`,
        template: 'accountingStatement.ejs',
        data: {
          entityName: statement.entityName || '',
          dateFrom: formatDate(statement.dateFrom),
          dateTo: formatDate(statement.dateTo),
          closingBalance: money(statement.closingBalance, statement.currency),
        },
        attachments: [{ filename: fileName, content: buffer }],
      });
    }

    auditService.logEvent({
      eventType: 'accounting.statement.generated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: {
        entityId: statement.entityId,
        entityType: statement.entityType,
        documentId: document._id,
        emailed: Boolean(email),
      },
      module: 'accounting',
    });

    logger.info('Accounting statement PDF generated', {
      module: 'accounting',
      action: 'statement.generate_pdf',
      documentId: document._id,
    });

    return { document, emailQueued: Boolean(email), fileName };
  }

  async createDunningOutput(letter, options, userId, meta = {}) {
    const recipientEmail = options.recipientEmail || letter.recipientEmail;
    if (options.sendEmail && !recipientEmail) {
      throw new AppError(`Recipient email missing for invoice ${letter.invoiceNumber}`, 400, ERROR_CODES.INVALID_INPUT);
    }

    const buffer = await generateDunningPdfBuffer(letter);
    const fileName = `Mahnung_${letter.invoiceNumber}_Stufe_${letter.level}.pdf`;
    const document = await this.storePdf({
      buffer,
      fileName,
      documentType: 'DUNNING_LETTER',
      linkedRecords: [{ recordType: 'AR_INVOICE', recordId: letter.invoiceId }],
      fullText: [
        letter.subject,
        stripHtml(letter.bodyHtml),
        letter.invoiceNumber,
        letter.customerName,
        letter.amountDue,
      ].filter(Boolean).join('\n'),
      userId,
      entityType: 'dunning',
      entityId: letter.invoiceId,
      notes: `Dunning level ${letter.level} for invoice ${letter.invoiceNumber}`,
    });

    let email = null;
    if (options.sendEmail) {
      email = await sendMail({
        email: recipientEmail,
        subject: letter.subject,
        template: 'dunningLetter.ejs',
        data: {
          customerName: letter.customerName,
          invoiceNumber: letter.invoiceNumber,
          dueDate: formatDate(letter.dueDate),
          amountDue: money(letter.amountDue, letter.currency),
          bodyText: stripHtml(letter.bodyHtml),
        },
        attachments: [{ filename: fileName, content: buffer }],
      });
    }

    auditService.logEvent({
      eventType: 'accounting.dunning.document_generated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: {
        invoiceId: letter.invoiceId,
        documentId: document._id,
        level: letter.level,
        emailed: Boolean(email),
      },
      module: 'accounting',
    });

    return { ...letter, documentId: document._id, fileName, emailQueued: Boolean(email) };
  }

  renderTemplate(template, data) {
    return renderTemplate(template, data);
  }
}

const accountingDocumentOutputService = new AccountingDocumentOutputService();
export default accountingDocumentOutputService;
