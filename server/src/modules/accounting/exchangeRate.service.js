import exchangeRateRepository from './exchangeRate.repository.js';
import auditService from '../auth/audit.service.js';
import { AppError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import logger from '../../shared/logger/index.js';

const RATE_PRECISION = 10;
const MONEY_PRECISION = 2;

function startOfUtcDay(value = new Date()) {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function normalizeCurrency(value) {
  return String(value || '').trim().toUpperCase();
}

function round(value, precision) {
  const factor = 10 ** precision;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function assertPair(baseCurrency, quoteCurrency) {
  if (baseCurrency === quoteCurrency) {
    throw new AppError(
      'Exchange rate currency pair must use two different currencies',
      400,
      ERROR_CODES.ACCT_EXCHANGE_RATE_INVALID_PAIR,
      [{ baseCurrency, quoteCurrency }],
    );
  }
}

function missingRateError(baseCurrency, quoteCurrency, asOfDate) {
  return new AppError(
    `Exchange rate ${baseCurrency}/${quoteCurrency} was not found for ${asOfDate.toISOString().slice(0, 10)}`,
    404,
    ERROR_CODES.ACCT_EXCHANGE_RATE_NOT_FOUND,
    [{ baseCurrency, quoteCurrency, asOfDate }],
  );
}

class ExchangeRateService {
  async list(query = {}) {
    const filters = {
      baseCurrency: query.baseCurrency ? normalizeCurrency(query.baseCurrency) : undefined,
      quoteCurrency: query.quoteCurrency ? normalizeCurrency(query.quoteCurrency) : undefined,
      startDate: query.startDate ? startOfUtcDay(query.startDate) : undefined,
      endDate: query.endDate ? startOfUtcDay(query.endDate) : undefined,
      limit: query.limit || 100,
    };

    return exchangeRateRepository.findWithFilters(filters);
  }

  async upsert(data, userId, meta = {}) {
    const baseCurrency = normalizeCurrency(data.baseCurrency);
    const quoteCurrency = normalizeCurrency(data.quoteCurrency);
    assertPair(baseCurrency, quoteCurrency);

    const rate = round(data.rate, RATE_PRECISION);
    const rateDate = startOfUtcDay(data.rateDate);
    const source = normalizeCurrency(data.source || 'MANUAL');

    const exchangeRate = await exchangeRateRepository.upsertDailyRate({
      baseCurrency,
      quoteCurrency,
      rate,
      rateDate,
      source,
      note: data.note || '',
      createdBy: userId,
      updatedBy: userId,
    });

    auditService.logEvent({
      eventType: 'accounting.exchange_rate.upserted',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: {
        exchangeRateId: exchangeRate._id,
        baseCurrency,
        quoteCurrency,
        rateDate,
        rate,
        source,
      },
      module: 'accounting',
    });

    logger.info('Exchange rate upserted', {
      module: 'accounting',
      action: 'exchange_rate.upsert',
      exchangeRateId: exchangeRate._id,
      baseCurrency,
      quoteCurrency,
      rateDate,
    });

    return exchangeRate;
  }

  async resolveRate(query = {}) {
    const baseCurrency = normalizeCurrency(query.baseCurrency);
    const quoteCurrency = normalizeCurrency(query.quoteCurrency);
    const asOfDate = startOfUtcDay(query.asOfDate || new Date());

    if (baseCurrency === quoteCurrency) {
      return {
        baseCurrency,
        quoteCurrency,
        asOfDate,
        rateDate: asOfDate,
        rate: 1,
        effectiveRate: 1,
        direction: 'IDENTITY',
        source: 'SYSTEM',
      };
    }

    const direct = await exchangeRateRepository.findRateAsOf({
      baseCurrency,
      quoteCurrency,
      asOfDate,
    });

    if (direct) {
      return {
        ...direct,
        asOfDate,
        effectiveRate: direct.rate,
        direction: 'DIRECT',
      };
    }

    const inverse = await exchangeRateRepository.findRateAsOf({
      baseCurrency: quoteCurrency,
      quoteCurrency: baseCurrency,
      asOfDate,
    });

    if (!inverse) throw missingRateError(baseCurrency, quoteCurrency, asOfDate);

    return {
      ...inverse,
      baseCurrency,
      quoteCurrency,
      asOfDate,
      effectiveRate: round(1 / Number(inverse.rate), RATE_PRECISION),
      direction: 'INVERSE',
      sourceBaseCurrency: inverse.baseCurrency,
      sourceQuoteCurrency: inverse.quoteCurrency,
    };
  }

  async convert({ amount, fromCurrency, toCurrency, asOfDate }) {
    const normalizedAmount = Number(amount || 0);
    const baseCurrency = normalizeCurrency(fromCurrency);
    const quoteCurrency = normalizeCurrency(toCurrency);
    const resolved = await this.resolveRate({
      baseCurrency,
      quoteCurrency,
      asOfDate,
    });
    const convertedAmount = round(normalizedAmount * resolved.effectiveRate, MONEY_PRECISION);

    return {
      amount: normalizedAmount,
      fromCurrency: baseCurrency,
      toCurrency: quoteCurrency,
      convertedAmount,
      rate: resolved.effectiveRate,
      rateDate: resolved.rateDate,
      asOfDate: resolved.asOfDate,
      direction: resolved.direction,
      source: resolved.source,
    };
  }

  async assertRateAvailable(baseCurrency, quoteCurrency, asOfDate, options = {}) {
    const sourceCurrency = normalizeCurrency(baseCurrency);
    const targetCurrency = normalizeCurrency(quoteCurrency);
    if (sourceCurrency === targetCurrency) return null;

    const postingDate = startOfUtcDay(asOfDate || new Date());
    const direct = await exchangeRateRepository.findRateAsOf({
      baseCurrency: sourceCurrency,
      quoteCurrency: targetCurrency,
      asOfDate: postingDate,
    }, options);

    if (direct) return direct;

    const inverse = await exchangeRateRepository.findRateAsOf({
      baseCurrency: targetCurrency,
      quoteCurrency: sourceCurrency,
      asOfDate: postingDate,
    }, options);

    if (inverse) return inverse;
    throw missingRateError(sourceCurrency, targetCurrency, postingDate);
  }
}

const exchangeRateService = new ExchangeRateService();
export default exchangeRateService;
