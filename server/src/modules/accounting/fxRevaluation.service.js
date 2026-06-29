import fxRevaluationRepository from './fxRevaluation.repository.js';
import exchangeRateService from './exchangeRate.service.js';
import journalEntryService from './journalEntry.service.js';
import accountMappingService, { ACCOUNT_MAPPING } from './accountMapping.service.js';
import counterService from './accounting.counter.service.js';
import auditService from '../auth/audit.service.js';
import { AppError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import logger from '../../shared/logger/index.js';

const DEFAULT_SOURCE_TYPES = ['AR_INVOICE', 'AP_BILL'];

function normalizeCurrency(value) {
  return String(value || 'CHF').trim().toUpperCase();
}

function normalizeSourceTypes(sourceTypes) {
  if (!sourceTypes?.length) return DEFAULT_SOURCE_TYPES;
  const values = Array.isArray(sourceTypes) ? sourceTypes : [sourceTypes];
  return [...new Set(values.map((type) => String(type).trim().toUpperCase()))];
}

function startOfUtcDay(value = new Date()) {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function totalsForLines(lines = []) {
  const totalGain = roundMoney(lines.filter((line) => line.gainLoss > 0).reduce((sum, line) => sum + line.gainLoss, 0));
  const totalLoss = roundMoney(Math.abs(lines.filter((line) => line.gainLoss < 0).reduce((sum, line) => sum + line.gainLoss, 0)));
  return {
    totalGain,
    totalLoss,
    netGainLoss: roundMoney(totalGain - totalLoss),
  };
}

function isMaterial(gainLoss) {
  return Math.abs(roundMoney(gainLoss)) >= 0.01;
}

class FxRevaluationService {
  async preview(query = {}) {
    const baseCurrency = normalizeCurrency(query.baseCurrency || 'CHF');
    const revaluationDate = startOfUtcDay(query.revaluationDate || new Date());
    const sourceTypes = normalizeSourceTypes(query.sourceTypes);
    const limit = query.limit || 500;
    const lines = await this._buildLines({ baseCurrency, revaluationDate, sourceTypes, limit });
    const totals = totalsForLines(lines);

    return {
      baseCurrency,
      revaluationDate,
      sourceTypes,
      lineCount: lines.length,
      ...totals,
      lines,
    };
  }

  async post(data = {}, userId, meta = {}) {
    const preview = await this.preview(data);
    const runNumber = await counterService.getNextFxRevaluationRunNumber();
    const postingLines = preview.lines.filter((line) => isMaterial(line.gainLoss));
    const run = await fxRevaluationRepository.createRun({
      runNumber,
      revaluationDate: preview.revaluationDate,
      baseCurrency: preview.baseCurrency,
      status: 'POSTING',
      sourceTypes: preview.sourceTypes,
      lines: postingLines,
      ...totalsForLines(postingLines),
      createdBy: userId,
    });

    try {
      const mappings = await this._resolveMappings();
      const postedLines = [];
      for (const line of postingLines) {
        const journalEntry = await this._postLine(run, line, mappings, userId);
        postedLines.push({
          ...line,
          journalEntryId: journalEntry._id,
        });
      }

      const totals = totalsForLines(postedLines);
      const updated = await fxRevaluationRepository.updateRun(run._id, {
        status: 'POSTED',
        lines: postedLines,
        ...totals,
      });

      auditService.logEvent({
        eventType: 'accounting.fx_revaluation.posted',
        userId,
        ipAddress: meta.ipAddress || 'internal',
        userAgent: meta.userAgent,
        result: 'success',
        details: {
          runId: run._id,
          runNumber,
          lineCount: postedLines.length,
          netGainLoss: totals.netGainLoss,
        },
        module: 'accounting',
      });

      return updated;
    } catch (err) {
      await fxRevaluationRepository.updateRun(run._id, {
        status: 'FAILED',
        errorMessage: err.message,
      });
      auditService.logEvent({
        eventType: 'accounting.fx_revaluation.failed',
        userId,
        ipAddress: meta.ipAddress || 'internal',
        userAgent: meta.userAgent,
        result: 'failure',
        details: { runId: run._id, runNumber, errorMessage: err.message },
        module: 'accounting',
      });
      logger.warn('FX revaluation failed', {
        module: 'accounting',
        action: 'fx_revaluation.post',
        runId: run._id,
        error: err.message,
      });
      throw err;
    }
  }

  async listRuns(filters = {}) {
    return fxRevaluationRepository.listRuns({
      ...filters,
      baseCurrency: filters.baseCurrency ? normalizeCurrency(filters.baseCurrency) : undefined,
    });
  }

  async _buildLines({ baseCurrency, revaluationDate, sourceTypes, limit }) {
    const rateCache = new Map();
    const convert = async ({ amount, currency, asOfDate }) => {
      const date = startOfUtcDay(asOfDate || revaluationDate);
      const key = `${currency}:${baseCurrency}:${date.toISOString().slice(0, 10)}`;
      if (!rateCache.has(key)) {
        rateCache.set(key, exchangeRateService.convert({
          amount: 1,
          fromCurrency: currency,
          toCurrency: baseCurrency,
          asOfDate: date,
        }));
      }
      const rate = await rateCache.get(key);
      return {
        rate: rate.rate,
        amount: roundMoney(Number(amount || 0) * Number(rate.rate || 0)),
      };
    };

    const lines = [];
    if (sourceTypes.includes('AR_INVOICE')) {
      const invoices = await fxRevaluationRepository.findOpenReceivables({ baseCurrency, limit });
      for (const invoice of invoices) {
        lines.push(await this._buildLine({
          sourceType: 'AR_INVOICE',
          sourceId: invoice._id,
          sourceNumber: invoice.invoiceNumber,
          partyName: invoice.customerName,
          sourceCurrency: invoice.currency,
          sourceAmount: invoice.amountDue,
          originalDate: invoice.invoiceDate,
          revaluationDate,
          baseCurrency,
          convert,
        }));
      }
    }

    if (sourceTypes.includes('AP_BILL')) {
      const invoices = await fxRevaluationRepository.findOpenPayables({ baseCurrency, limit });
      for (const invoice of invoices) {
        lines.push(await this._buildLine({
          sourceType: 'AP_BILL',
          sourceId: invoice._id,
          sourceNumber: invoice.apInvoiceNumber || invoice.supplierInvoiceNumber,
          partyName: invoice.supplierName,
          sourceCurrency: invoice.currency,
          sourceAmount: invoice.outstandingAmount,
          originalDate: invoice.invoiceDate,
          revaluationDate,
          baseCurrency,
          convert,
        }));
      }
    }

    return lines.filter((line) => isMaterial(line.gainLoss));
  }

  async _buildLine({
    sourceType,
    sourceId,
    sourceNumber,
    partyName,
    sourceCurrency,
    sourceAmount,
    originalDate,
    revaluationDate,
    convert,
  }) {
    const original = await convert({ amount: sourceAmount, currency: sourceCurrency, asOfDate: originalDate });
    const current = await convert({ amount: sourceAmount, currency: sourceCurrency, asOfDate: revaluationDate });
    const gainLoss = sourceType === 'AR_INVOICE'
      ? roundMoney(current.amount - original.amount)
      : roundMoney(original.amount - current.amount);

    return {
      sourceType,
      sourceId,
      sourceNumber,
      partyName,
      sourceCurrency,
      sourceAmount: roundMoney(sourceAmount),
      originalRate: original.rate,
      currentRate: current.rate,
      bookedBaseAmount: original.amount,
      currentBaseAmount: current.amount,
      gainLoss,
    };
  }

  async _resolveMappings() {
    const [
      receivableAccountId,
      payableAccountId,
      unrealizedGainAccountId,
      unrealizedLossAccountId,
    ] = await Promise.all([
      accountMappingService.resolveGlobal(ACCOUNT_MAPPING.AR_RECEIVABLE),
      accountMappingService.resolveGlobal(ACCOUNT_MAPPING.AP_PAYABLE),
      accountMappingService.resolveGlobal(ACCOUNT_MAPPING.FX_UNREALIZED_GAIN),
      accountMappingService.resolveGlobal(ACCOUNT_MAPPING.FX_UNREALIZED_LOSS),
    ]);
    return {
      receivableAccountId,
      payableAccountId,
      unrealizedGainAccountId,
      unrealizedLossAccountId,
    };
  }

  async _postLine(run, line, mappings, userId) {
    const amount = Math.abs(roundMoney(line.gainLoss));
    if (!amount) {
      throw new AppError(
        'FX revaluation journal amount must be greater than zero',
        400,
        ERROR_CODES.ACCT_FX_REVALUATION_INVALID,
      );
    }

    let debitAccountId;
    let creditAccountId;
    if (line.sourceType === 'AR_INVOICE' && line.gainLoss > 0) {
      debitAccountId = mappings.receivableAccountId;
      creditAccountId = mappings.unrealizedGainAccountId;
    } else if (line.sourceType === 'AR_INVOICE') {
      debitAccountId = mappings.unrealizedLossAccountId;
      creditAccountId = mappings.receivableAccountId;
    } else if (line.sourceType === 'AP_BILL' && line.gainLoss > 0) {
      debitAccountId = mappings.payableAccountId;
      creditAccountId = mappings.unrealizedGainAccountId;
    } else {
      debitAccountId = mappings.unrealizedLossAccountId;
      creditAccountId = mappings.payableAccountId;
    }

    return journalEntryService.createFromEvent(
      'FX_REVALUATION',
      run._id,
      debitAccountId,
      creditAccountId,
      amount,
      `FX revaluation ${line.sourceNumber} ${line.sourceCurrency}/${run.baseCurrency}`,
      userId,
      {
        entryDate: run.revaluationDate,
        currency: run.baseCurrency,
      },
    );
  }
}

const fxRevaluationService = new FxRevaluationService();
export default fxRevaluationService;
