import { roundCurrency } from '../../shared/data/currencies.js';
import taxRepository from './tax.repository.js';
import auditService from '../auth/audit.service.js';
import { AppError, NotFoundError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeCurrency(value) {
  return String(value || 'CHF').trim().toUpperCase();
}

function dateInRange(date, validFrom, validTo) {
  const checkDate = new Date(date);
  return (!validFrom || new Date(validFrom) <= checkDate) &&
    (!validTo || checkDate <= new Date(validTo));
}

function legacyTaxCode(rate, direction = 'BOTH') {
  const normalizedRate = Number(rate || 0);
  const code = normalizedRate === 0
    ? 'TAX_ZERO'
    : `VAT_${String(normalizedRate).replace('.', '_')}`;
  return {
    _id: null,
    code,
    name: `Legacy VAT ${normalizedRate}%`,
    type: 'VAT',
    direction,
    scope: normalizedRate === 0 ? 'ZERO' : 'STANDARD',
    country: 'CH',
    rate: normalizedRate,
    recoverablePercent: 100,
    isActive: true,
  };
}

function lineBaseAmount(line = {}, currency = 'CHF') {
  if (line.lineTotal !== undefined) return roundCurrency(line.lineTotal, currency);
  return roundCurrency(Number(line.quantity || 0) * Number(line.unitPrice || 0), currency);
}

function directionMatches(taxCode, direction) {
  return taxCode.direction === 'BOTH' || taxCode.direction === direction || taxCode.direction === 'WITHHOLDING';
}

class TaxService {
  async listCodes(filters = {}) {
    return taxRepository.findCodes({
      type: filters.type ? normalizeCode(filters.type) : undefined,
      direction: filters.direction ? normalizeCode(filters.direction) : undefined,
      country: filters.country ? normalizeCode(filters.country) : undefined,
      isActive: filters.isActive,
    });
  }

  async createCode(data, userId, meta = {}) {
    const code = await taxRepository.createCode({
      ...data,
      code: normalizeCode(data.code),
      type: normalizeCode(data.type || 'VAT'),
      direction: normalizeCode(data.direction || 'BOTH'),
      scope: normalizeCode(data.scope || 'STANDARD'),
      country: normalizeCode(data.country || 'CH'),
      createdBy: userId,
    });

    auditService.logEvent({
      eventType: 'accounting.tax_code.created',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { taxCodeId: code._id, code: code.code, rate: code.rate },
      module: 'accounting',
    });

    return code;
  }

  async updateCode(id, data, userId, meta = {}) {
    const updated = await taxRepository.updateCode(id, {
      ...data,
      code: data.code ? normalizeCode(data.code) : undefined,
      type: data.type ? normalizeCode(data.type) : undefined,
      direction: data.direction ? normalizeCode(data.direction) : undefined,
      scope: data.scope ? normalizeCode(data.scope) : undefined,
      country: data.country ? normalizeCode(data.country) : undefined,
      updatedBy: userId,
    });
    if (!updated) throw new NotFoundError('TaxCode', id);

    auditService.logEvent({
      eventType: 'accounting.tax_code.updated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { taxCodeId: id, changedFields: Object.keys(data) },
      module: 'accounting',
    });

    return updated;
  }

  async listGroups(filters = {}) {
    return taxRepository.findGroups({
      country: filters.country ? normalizeCode(filters.country) : undefined,
      isActive: filters.isActive,
    });
  }

  async createGroup(data, userId) {
    return taxRepository.createGroup({
      ...data,
      code: normalizeCode(data.code),
      country: normalizeCode(data.country || 'CH'),
      createdBy: userId,
    });
  }

  async listExemptions(filters = {}) {
    return taxRepository.findExemptions(filters);
  }

  async createExemption(data, userId) {
    return taxRepository.createExemption({
      ...data,
      code: normalizeCode(data.code),
      createdBy: userId,
    });
  }

  async resolveTaxCode(line = {}, direction = 'BOTH', documentDate = new Date()) {
    let taxCode = null;
    if (line.taxCodeId) {
      taxCode = await taxRepository.findCodeById(line.taxCodeId);
    } else if (line.taxCode) {
      taxCode = await taxRepository.findCodeByCode(line.taxCode);
    }

    if (!taxCode) {
      return legacyTaxCode(line.vatRate ?? line.taxRate ?? 0, direction);
    }

    if (!taxCode.isActive || !dateInRange(documentDate, taxCode.validFrom, taxCode.validTo)) {
      throw new AppError(
        `Tax code ${taxCode.code} is not valid for the document date`,
        409,
        ERROR_CODES.ACCT_TAX_CODE_INVALID,
        [{ taxCode: taxCode.code, documentDate }],
      );
    }
    if (!directionMatches(taxCode, direction)) {
      throw new AppError(
        `Tax code ${taxCode.code} cannot be used for ${direction.toLowerCase()} tax`,
        409,
        ERROR_CODES.ACCT_TAX_CODE_INVALID,
        [{ taxCode: taxCode.code, direction }],
      );
    }

    return taxCode;
  }

  async resolveExemption(exemptionCode, documentDate = new Date()) {
    const normalizedExemptionCode = normalizeCode(exemptionCode);
    if (!normalizedExemptionCode) return null;
    const exemption = await taxRepository.findExemptionByCode(normalizedExemptionCode);
    if (!exemption) throw new NotFoundError('TaxExemption', exemptionCode);
    if (!dateInRange(documentDate, exemption.validFrom, exemption.validTo)) {
      throw new AppError(
        `Tax exemption ${exemption.code} is not valid for the document date`,
        409,
        ERROR_CODES.ACCT_TAX_EXEMPTION_INVALID,
        [{ exemptionCode: exemption.code, documentDate }],
      );
    }
    return exemption;
  }

  async calculateDocument({ lineItems = [], documentDate = new Date(), currency = 'CHF', direction = 'INPUT', exemptionCode = null } = {}) {
    const normalizedDirection = normalizeCode(direction || 'INPUT');
    const normalizedCurrency = normalizeCurrency(currency);
    const roundMoney = value => roundCurrency(value, normalizedCurrency);
    const exemption = await this.resolveExemption(exemptionCode, documentDate);
    const lines = [];
    const breakdown = new Map();

    for (const [index, line] of lineItems.entries()) {
      const taxableAmount = lineBaseAmount(line, normalizedCurrency);
      const taxCode = exemption
        ? legacyTaxCode(0, normalizedDirection)
        : await this.resolveTaxCode(line, normalizedDirection, documentDate);
      const rate = exemption ? 0 : Number(taxCode.rate || 0);
      const taxAmount = roundMoney(taxableAmount * (rate / 100));
      const isWithholding = taxCode.type === 'WITHHOLDING' || normalizedDirection === 'WITHHOLDING';
      const grossAmount = roundMoney(isWithholding ? taxableAmount - taxAmount : taxableAmount + taxAmount);
      const recoverablePercent = normalizedDirection === 'INPUT' ? Number(taxCode.recoverablePercent ?? 100) : 0;
      const recoverableAmount = roundMoney(taxAmount * (recoverablePercent / 100));
      const nonRecoverableAmount = roundMoney(taxAmount - recoverableAmount);
      const key = `${normalizedDirection}:${taxCode.code}:${rate}`;

      const calculatedLine = {
        lineKey: String(line.position ?? index + 1),
        description: line.description || '',
        taxCodeId: taxCode._id || null,
        taxCode: taxCode.code,
        taxType: taxCode.type,
        taxRate: rate,
        direction: normalizedDirection,
        taxableAmount,
        taxAmount,
        recoverableAmount,
        nonRecoverableAmount,
        grossAmount,
        currency: normalizedCurrency,
        exemptionCode: exemption?.code || null,
      };
      lines.push(calculatedLine);

      const current = breakdown.get(key) || {
        direction: normalizedDirection,
        taxCodeId: taxCode._id || null,
        taxCode: taxCode.code,
        taxType: taxCode.type,
        taxRate: rate,
        taxableAmount: 0,
        taxAmount: 0,
        recoverableAmount: 0,
        nonRecoverableAmount: 0,
        grossAmount: 0,
        currency: normalizedCurrency,
      };
      current.taxableAmount = roundMoney(current.taxableAmount + taxableAmount);
      current.taxAmount = roundMoney(current.taxAmount + taxAmount);
      current.recoverableAmount = roundMoney(current.recoverableAmount + recoverableAmount);
      current.nonRecoverableAmount = roundMoney(current.nonRecoverableAmount + nonRecoverableAmount);
      current.grossAmount = roundMoney(current.grossAmount + grossAmount);
      breakdown.set(key, current);
    }

    const totals = lines.reduce((acc, line) => ({
      taxableAmount: roundMoney(acc.taxableAmount + line.taxableAmount),
      taxAmount: roundMoney(acc.taxAmount + line.taxAmount),
      recoverableAmount: roundMoney(acc.recoverableAmount + line.recoverableAmount),
      nonRecoverableAmount: roundMoney(acc.nonRecoverableAmount + line.nonRecoverableAmount),
      grossAmount: roundMoney(acc.grossAmount + line.grossAmount),
    }), {
      taxableAmount: 0,
      taxAmount: 0,
      recoverableAmount: 0,
      nonRecoverableAmount: 0,
      grossAmount: 0,
    });

    return {
      currency: normalizedCurrency,
      direction: normalizedDirection,
      documentDate,
      lines,
      breakdown: [...breakdown.values()],
      totals,
      exemption: exemption ? { code: exemption.code, reason: exemption.reason } : null,
    };
  }

  async recordFromApInvoice(invoice, userId = null, options = {}) {
    const calculation = await this.calculateDocument({
      lineItems: invoice.lineItems || [],
      documentDate: invoice.invoiceDate,
      currency: invoice.currency || 'CHF',
      direction: 'INPUT',
      exemptionCode: invoice.taxExemptionCode,
    });
    const transactions = calculation.lines
      .filter((line) => line.taxAmount !== 0 || line.taxableAmount !== 0)
      .map((line) => ({
        sourceType: 'AP_INVOICE',
        sourceId: invoice._id,
        sourceNumber: invoice.apInvoiceNumber || invoice.supplierInvoiceNumber || '',
        sourceLineKey: line.lineKey,
        transactionDate: invoice.invoiceDate || new Date(),
        direction: 'INPUT',
        taxType: line.taxType,
        taxCodeId: line.taxCodeId,
        taxCode: line.taxCode,
        taxRate: line.taxRate,
        taxableAmount: line.taxableAmount,
        taxAmount: line.taxAmount,
        recoverableAmount: line.recoverableAmount,
        nonRecoverableAmount: line.nonRecoverableAmount,
        grossAmount: line.grossAmount,
        currency: line.currency,
        partyId: invoice.supplierId || null,
        partyName: invoice.supplierName || '',
        createdBy: userId,
      }));

    return taxRepository.replaceTransactionsForSource('AP_INVOICE', invoice._id, transactions, options);
  }

  async recordFromArInvoiceEvent(data, options = {}) {
    const vatBreakdown = Array.isArray(data.vatBreakdown) ? data.vatBreakdown : [];
    const currency = normalizeCurrency(data.currency);
    const sourceId = data.invoiceId;
    const invoiceDate = data.invoiceDate || new Date();
    const rows = vatBreakdown.length
      ? vatBreakdown
      : [{
        rate: data.totalAmount ? roundMoney(((Number(data.totalGross || 0) - Number(data.totalAmount || 0)) / Number(data.totalAmount || 1)) * 100) : 0,
        base: Number(data.totalAmount || 0),
        amount: roundMoney(Number(data.totalGross || 0) - Number(data.totalAmount || 0)),
      }];

    const transactions = rows.map((row, index) => {
      const taxCode = legacyTaxCode(row.rate, 'OUTPUT');
      const taxableAmount = roundMoney(row.base);
      const taxAmount = roundMoney(row.amount);
      return {
        sourceType: 'AR_INVOICE',
        sourceId,
        sourceNumber: data.invoiceNumber || '',
        sourceLineKey: String(index + 1),
        transactionDate: invoiceDate,
        direction: 'OUTPUT',
        taxType: taxCode.type,
        taxCode: taxCode.code,
        taxRate: Number(row.rate || 0),
        taxableAmount,
        taxAmount,
        recoverableAmount: 0,
        nonRecoverableAmount: 0,
        grossAmount: roundMoney(taxableAmount + taxAmount),
        currency,
        partyId: data.customerId || null,
        partyName: data.customerName || '',
        createdBy: data.userId || null,
      };
    }).filter((row) => row.taxAmount !== 0 || row.taxableAmount !== 0);

    return taxRepository.replaceTransactionsForSource('AR_INVOICE', sourceId, transactions, options);
  }

  async listTransactions(filters = {}) {
    return taxRepository.findTransactions({
      ...filters,
      direction: filters.direction ? normalizeCode(filters.direction) : undefined,
      taxCode: filters.taxCode ? normalizeCode(filters.taxCode) : undefined,
      currency: filters.currency ? normalizeCurrency(filters.currency) : undefined,
      limit: filters.limit || 500,
    });
  }

  async getSummary(query = {}) {
    const rows = await taxRepository.summarizeTransactions({
      startDate: query.startDate,
      endDate: query.endDate,
      currency: query.currency ? normalizeCurrency(query.currency) : undefined,
    });
    const summaryRows = rows.map((row) => ({
      direction: row._id.direction,
      taxCode: row._id.taxCode,
      taxRate: row._id.taxRate,
      currency: row._id.currency,
      taxableAmount: roundMoney(row.taxableAmount),
      taxAmount: roundMoney(row.taxAmount),
      recoverableAmount: roundMoney(row.recoverableAmount),
      nonRecoverableAmount: roundMoney(row.nonRecoverableAmount),
      grossAmount: roundMoney(row.grossAmount),
      count: row.count,
    }));

    const outputTax = roundMoney(summaryRows
      .filter((row) => row.direction === 'OUTPUT')
      .reduce((sum, row) => sum + row.taxAmount, 0));
    const inputTax = roundMoney(summaryRows
      .filter((row) => row.direction === 'INPUT')
      .reduce((sum, row) => sum + row.recoverableAmount, 0));
    const withholdingTax = roundMoney(summaryRows
      .filter((row) => row.direction === 'WITHHOLDING')
      .reduce((sum, row) => sum + row.taxAmount, 0));

    return {
      period: { startDate: query.startDate || null, endDate: query.endDate || null },
      currency: query.currency || null,
      outputTax,
      inputTax,
      withholdingTax,
      netTaxPayable: roundMoney(outputTax - inputTax + withholdingTax),
      rows: summaryRows,
    };
  }
}

const taxService = new TaxService();
export default taxService;
