import axios from 'axios';
import { AppError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import config from '../../config/index.js';

const DATE_PATTERNS = [
  /(\d{4}-\d{2}-\d{2})/,
  /(\d{2})\.(\d{2})\.(\d{4})/,
];

function parseDate(value) {
  if (!value) return undefined;
  for (const pattern of DATE_PATTERNS) {
    const match = String(value).match(pattern);
    if (!match) continue;
    if (match.length === 2) return new Date(`${match[1]}T00:00:00.000Z`);
    return new Date(`${match[3]}-${match[2]}-${match[1]}T00:00:00.000Z`);
  }
  return undefined;
}

function parseAmount(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = String(value)
    .replace(/CHF|EUR/gi, '')
    .replace(/\s/g, '')
    .replace(/'/g, '')
    .replace(',', '.');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : undefined;
}

function pickFirstTextLine(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || '';
}

function extractWithRegex(text) {
  const supplierName = (text.match(/(?:supplier|lieferant|fournisseur|fornitore)\s*[:-]\s*(.+)/i)?.[1]
    || pickFirstTextLine(text)).trim();
  const invoiceNumber = text.match(/(?:invoice|rechnung|facture|fattura)\s*(?:no\.?|nr\.?|number)?\s*[:#-]\s*([A-Z0-9][A-Z0-9/_-]+)/i)?.[1];
  const invoiceDate = parseDate(text.match(/(?:invoice date|rechnungsdatum|date facture|data fattura)\s*[:-]\s*([0-9.-]+)/i)?.[1]);
  const dueDate = parseDate(text.match(/(?:due date|faellig|fällig|zahlbar bis|echeance|scadenza)\s*[:-]\s*([0-9.-]+)/i)?.[1]);
  const total = parseAmount(text.match(/(?:total|betrag|gesamt|montant|totale)\s*[:-]\s*(?:CHF|EUR)?\s*([0-9'.,]+)/i)?.[1]);
  const vat = parseAmount(text.match(/(?:vat|mwst|tva|iva)\s*[:-]\s*(?:CHF|EUR)?\s*([0-9'.,]+)/i)?.[1]);

  return {
    fields: {
      supplierName,
      invoiceNumber,
      invoiceDate,
      dueDate,
      total,
      vat,
      lineItems: [],
    },
    confidenceScores: {
      supplierName: supplierName ? 0.75 : 0,
      invoiceNumber: invoiceNumber ? 0.75 : 0,
      invoiceDate: invoiceDate ? 0.7 : 0,
      dueDate: dueDate ? 0.65 : 0,
      total: total ? 0.75 : 0,
      vat: vat !== undefined ? 0.7 : 0,
    },
    rawText: text,
    rawPayload: null,
  };
}

function normalizeProviderResponse(response, rawText = '') {
  const payload = response?.data || response || {};
  const fields = payload.fields || payload.extracted || payload;
  const confidenceScores = payload.confidenceScores || payload.confidence || {};

  return {
    fields: {
      supplierName: fields.supplierName || fields.extractedSupplierName || '',
      supplierAddress: fields.supplierAddress || fields.extractedSupplierAddress || '',
      invoiceNumber: fields.invoiceNumber || fields.extractedInvoiceNumber || '',
      invoiceDate: parseDate(fields.invoiceDate || fields.extractedInvoiceDate),
      dueDate: parseDate(fields.dueDate || fields.extractedDueDate),
      total: parseAmount(fields.total ?? fields.extractedTotal),
      vat: parseAmount(fields.vat ?? fields.extractedVat),
      lineItems: fields.lineItems || fields.extractedLineItems || [],
    },
    confidenceScores,
    rawText: payload.rawText || rawText,
    rawPayload: payload,
  };
}

function lowConfidenceFields(confidenceScores) {
  return Object.entries(confidenceScores || {})
    .filter(([, score]) => Number(score) < config.ocr.lowConfidenceThreshold)
    .map(([field]) => field);
}

class OcrProviderService {
  async extract({ document, buffer }) {
    if (!buffer?.length) {
      throw new AppError('OCR input file is empty', 400, ERROR_CODES.ACCT_OCR_PROCESSING_FAILED);
    }

    const provider = config.ocr.provider;
    let extracted;

    if (provider === 'http') {
      extracted = await this._extractViaHttp(document, buffer);
    } else if (provider === 'text' || document.mimeType === 'text/plain') {
      extracted = extractWithRegex(buffer.toString('utf8'));
    } else {
      throw new AppError(
        'OCR provider is not configured',
        503,
        ERROR_CODES.ACCT_OCR_PROCESSING_FAILED,
        [{ expected: 'OCR_PROVIDER=http or OCR_PROVIDER=text', actual: provider }],
      );
    }

    return {
      provider,
      ...extracted,
      lowConfidenceFields: lowConfidenceFields(extracted.confidenceScores),
    };
  }

  async _extractViaHttp(document, buffer) {
    if (!config.ocr.httpEndpoint) {
      throw new AppError(
        'OCR HTTP endpoint is not configured',
        503,
        ERROR_CODES.ACCT_OCR_PROCESSING_FAILED,
      );
    }

    const response = await axios.post(
      config.ocr.httpEndpoint,
      {
        documentId: String(document._id),
        fileName: document.fileName,
        mimeType: document.mimeType,
        fileBase64: buffer.toString('base64'),
      },
      {
        timeout: config.ocr.timeoutMs,
        headers: config.ocr.httpApiKey
          ? { Authorization: `Bearer ${config.ocr.httpApiKey}` }
          : undefined,
      },
    );

    return normalizeProviderResponse(response);
  }
}

const ocrProviderService = new OcrProviderService();
export default ocrProviderService;
