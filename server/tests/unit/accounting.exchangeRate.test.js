import { jest, describe, expect, test, beforeEach } from '@jest/globals';

async function loadExchangeRateService() {
  jest.resetModules();

  const repository = {
    findWithFilters: jest.fn(),
    upsertDailyRate: jest.fn(),
    findRateAsOf: jest.fn(),
  };
  const auditService = { logEvent: jest.fn() };
  const logger = { info: jest.fn() };

  jest.unstable_mockModule('../../src/modules/accounting/exchangeRate.repository.js', () => ({
    default: repository,
  }));
  jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({
    default: auditService,
  }));
  jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
    default: logger,
  }));

  const service = (await import('../../src/modules/accounting/exchangeRate.service.js')).default;
  return { service, repository, auditService, logger };
}

describe('exchange rate service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('upserts one normalized daily rate per currency pair', async () => {
    const { service, repository, auditService } = await loadExchangeRateService();
    repository.upsertDailyRate.mockResolvedValue({
      _id: 'rate-1',
      baseCurrency: 'CHF',
      quoteCurrency: 'EUR',
      rate: 0.96325,
      rateDate: new Date('2026-06-25T00:00:00.000Z'),
      source: 'SNB',
    });

    const result = await service.upsert({
      baseCurrency: 'chf',
      quoteCurrency: 'eur',
      rate: 0.96325,
      rateDate: '2026-06-25T15:45:00.000Z',
      source: 'snb',
      note: 'Daily fixing',
    }, 'user-1', { ipAddress: '127.0.0.1' });

    expect(repository.upsertDailyRate).toHaveBeenCalledWith(expect.objectContaining({
      baseCurrency: 'CHF',
      quoteCurrency: 'EUR',
      rate: 0.96325,
      rateDate: new Date('2026-06-25T00:00:00.000Z'),
      source: 'SNB',
      note: 'Daily fixing',
      createdBy: 'user-1',
      updatedBy: 'user-1',
    }));
    expect(auditService.logEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'accounting.exchange_rate.upserted',
      module: 'accounting',
    }));
    expect(result._id).toBe('rate-1');
  });

  test('rejects same-currency rates', async () => {
    const { service, repository } = await loadExchangeRateService();

    await expect(service.upsert({
      baseCurrency: 'CHF',
      quoteCurrency: 'CHF',
      rate: 1,
      rateDate: '2026-06-25',
    }, 'user-1')).rejects.toMatchObject({
      statusCode: 400,
      code: 'ACCT_EXCHANGE_RATE_INVALID_PAIR',
    });
    expect(repository.upsertDailyRate).not.toHaveBeenCalled();
  });

  test('resolves the latest direct rate as of the requested date', async () => {
    const { service, repository } = await loadExchangeRateService();
    repository.findRateAsOf.mockResolvedValueOnce({
      _id: 'rate-1',
      baseCurrency: 'CHF',
      quoteCurrency: 'EUR',
      rate: 0.95,
      rateDate: new Date('2026-06-24T00:00:00.000Z'),
      source: 'MANUAL',
    });

    const result = await service.resolveRate({
      baseCurrency: 'CHF',
      quoteCurrency: 'EUR',
      asOfDate: '2026-06-25T12:00:00.000Z',
    });

    expect(repository.findRateAsOf).toHaveBeenCalledWith({
      baseCurrency: 'CHF',
      quoteCurrency: 'EUR',
      asOfDate: new Date('2026-06-25T00:00:00.000Z'),
    });
    expect(result).toEqual(expect.objectContaining({
      effectiveRate: 0.95,
      direction: 'DIRECT',
      asOfDate: new Date('2026-06-25T00:00:00.000Z'),
    }));
  });

  test('resolves inverse rates when direct pair is unavailable', async () => {
    const { service, repository } = await loadExchangeRateService();
    repository.findRateAsOf
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        _id: 'rate-2',
        baseCurrency: 'EUR',
        quoteCurrency: 'CHF',
        rate: 1.1,
        rateDate: new Date('2026-06-24T00:00:00.000Z'),
        source: 'ECB',
      });

    const result = await service.resolveRate({
      baseCurrency: 'CHF',
      quoteCurrency: 'EUR',
      asOfDate: '2026-06-25',
    });

    expect(repository.findRateAsOf).toHaveBeenNthCalledWith(2, {
      baseCurrency: 'EUR',
      quoteCurrency: 'CHF',
      asOfDate: new Date('2026-06-25T00:00:00.000Z'),
    });
    expect(result).toEqual(expect.objectContaining({
      baseCurrency: 'CHF',
      quoteCurrency: 'EUR',
      effectiveRate: 0.9090909091,
      direction: 'INVERSE',
      sourceBaseCurrency: 'EUR',
      sourceQuoteCurrency: 'CHF',
    }));
  });

  test('converts money with historical rate and rounds to cents', async () => {
    const { service, repository } = await loadExchangeRateService();
    repository.findRateAsOf.mockResolvedValueOnce({
      _id: 'rate-3',
      baseCurrency: 'CHF',
      quoteCurrency: 'USD',
      rate: 1.13245,
      rateDate: new Date('2026-06-25T00:00:00.000Z'),
      source: 'API',
    });

    const result = await service.convert({
      amount: 1000,
      fromCurrency: 'CHF',
      toCurrency: 'USD',
      asOfDate: '2026-06-25',
    });

    expect(result).toEqual(expect.objectContaining({
      amount: 1000,
      fromCurrency: 'CHF',
      toCurrency: 'USD',
      convertedAmount: 1132.45,
      rate: 1.13245,
      direction: 'DIRECT',
    }));
  });

  test('raises a domain error when no historical rate exists', async () => {
    const { service, repository } = await loadExchangeRateService();
    repository.findRateAsOf.mockResolvedValue(null);

    await expect(service.resolveRate({
      baseCurrency: 'GBP',
      quoteCurrency: 'CHF',
      asOfDate: '2026-06-25',
    })).rejects.toMatchObject({
      statusCode: 404,
      code: 'ACCT_EXCHANGE_RATE_NOT_FOUND',
    });
  });
});
