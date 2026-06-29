import { jest, describe, expect, test, beforeEach } from '@jest/globals';

async function loadFxRevaluationService() {
  jest.resetModules();

  const fxRevaluationRepository = {
    findOpenReceivables: jest.fn(),
    findOpenPayables: jest.fn(),
    createRun: jest.fn(),
    updateRun: jest.fn(),
    listRuns: jest.fn(),
  };
  const exchangeRateService = {
    convert: jest.fn(async ({ asOfDate }) => {
      const date = new Date(asOfDate).toISOString().slice(0, 10);
      const rate = date === '2026-01-01' ? 0.9 : 1;
      return { rate };
    }),
  };
  const journalEntryService = { createFromEvent: jest.fn() };
  const accountMappingService = { resolveGlobal: jest.fn() };
  const counterService = {
    getNextFxRevaluationRunNumber: jest.fn(async () => 'FXR-2026-00001'),
  };
  const auditService = { logEvent: jest.fn() };
  const logger = { warn: jest.fn() };

  jest.unstable_mockModule('../../src/modules/accounting/fxRevaluation.repository.js', () => ({
    default: fxRevaluationRepository,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/exchangeRate.service.js', () => ({
    default: exchangeRateService,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/journalEntry.service.js', () => ({
    default: journalEntryService,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/accountMapping.service.js', () => ({
    default: accountMappingService,
    ACCOUNT_MAPPING: {
      AR_RECEIVABLE: 'AR_RECEIVABLE',
      AP_PAYABLE: 'AP_PAYABLE',
      FX_UNREALIZED_GAIN: 'FX_UNREALIZED_GAIN',
      FX_UNREALIZED_LOSS: 'FX_UNREALIZED_LOSS',
    },
  }));
  jest.unstable_mockModule('../../src/modules/accounting/accounting.counter.service.js', () => ({
    default: counterService,
  }));
  jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({
    default: auditService,
  }));
  jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
    default: logger,
  }));

  const service = (await import('../../src/modules/accounting/fxRevaluation.service.js')).default;
  return {
    service,
    fxRevaluationRepository,
    exchangeRateService,
    journalEntryService,
    accountMappingService,
    counterService,
    auditService,
  };
}

const openReceivable = {
  _id: '507f1f77bcf86cd799439031',
  invoiceNumber: 'INV-1',
  customerName: 'Customer AG',
  currency: 'EUR',
  amountDue: 100,
  invoiceDate: new Date('2026-01-01T00:00:00.000Z'),
};

const openPayable = {
  _id: '507f1f77bcf86cd799439032',
  apInvoiceNumber: 'APR-1',
  supplierName: 'Supplier AG',
  currency: 'EUR',
  outstandingAmount: 100,
  invoiceDate: new Date('2026-01-01T00:00:00.000Z'),
};

describe('FX revaluation service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('previews unrealized FX gains and losses for open AR and AP', async () => {
    const { service, fxRevaluationRepository, exchangeRateService } = await loadFxRevaluationService();
    fxRevaluationRepository.findOpenReceivables.mockResolvedValue([openReceivable]);
    fxRevaluationRepository.findOpenPayables.mockResolvedValue([openPayable]);

    const preview = await service.preview({
      baseCurrency: 'CHF',
      revaluationDate: '2026-01-31',
    });

    expect(exchangeRateService.convert).toHaveBeenCalledWith(expect.objectContaining({
      amount: 1,
      fromCurrency: 'EUR',
      toCurrency: 'CHF',
    }));
    expect(preview.lines).toEqual([
      expect.objectContaining({
        sourceType: 'AR_INVOICE',
        sourceNumber: 'INV-1',
        bookedBaseAmount: 90,
        currentBaseAmount: 100,
        gainLoss: 10,
      }),
      expect.objectContaining({
        sourceType: 'AP_BILL',
        sourceNumber: 'APR-1',
        bookedBaseAmount: 90,
        currentBaseAmount: 100,
        gainLoss: -10,
      }),
    ]);
    expect(preview.totalGain).toBe(10);
    expect(preview.totalLoss).toBe(10);
    expect(preview.netGainLoss).toBe(0);
  });

  test('posts FX revaluation journals with correct AR/AP gain-loss direction', async () => {
    const {
      service,
      fxRevaluationRepository,
      journalEntryService,
      accountMappingService,
      auditService,
    } = await loadFxRevaluationService();
    fxRevaluationRepository.findOpenReceivables.mockResolvedValue([openReceivable]);
    fxRevaluationRepository.findOpenPayables.mockResolvedValue([openPayable]);
    fxRevaluationRepository.createRun.mockResolvedValue({
      _id: '507f1f77bcf86cd799439033',
      runNumber: 'FXR-2026-00001',
      revaluationDate: new Date('2026-01-31T00:00:00.000Z'),
      baseCurrency: 'CHF',
    });
    fxRevaluationRepository.updateRun.mockResolvedValue({
      _id: '507f1f77bcf86cd799439033',
      status: 'POSTED',
      lines: [{ journalEntryId: 'journal-1' }, { journalEntryId: 'journal-2' }],
      netGainLoss: 0,
    });
    accountMappingService.resolveGlobal
      .mockResolvedValueOnce('ar-account')
      .mockResolvedValueOnce('ap-account')
      .mockResolvedValueOnce('gain-account')
      .mockResolvedValueOnce('loss-account');
    journalEntryService.createFromEvent
      .mockResolvedValueOnce({ _id: 'journal-1' })
      .mockResolvedValueOnce({ _id: 'journal-2' });

    const run = await service.post({ baseCurrency: 'CHF', revaluationDate: '2026-01-31' }, 'user-1');

    expect(journalEntryService.createFromEvent).toHaveBeenNthCalledWith(
      1,
      'FX_REVALUATION',
      '507f1f77bcf86cd799439033',
      'ar-account',
      'gain-account',
      10,
      'FX revaluation INV-1 EUR/CHF',
      'user-1',
      expect.objectContaining({ currency: 'CHF' }),
    );
    expect(journalEntryService.createFromEvent).toHaveBeenNthCalledWith(
      2,
      'FX_REVALUATION',
      '507f1f77bcf86cd799439033',
      'loss-account',
      'ap-account',
      10,
      'FX revaluation APR-1 EUR/CHF',
      'user-1',
      expect.objectContaining({ currency: 'CHF' }),
    );
    expect(fxRevaluationRepository.updateRun).toHaveBeenCalledWith('507f1f77bcf86cd799439033', expect.objectContaining({
      status: 'POSTED',
      totalGain: 10,
      totalLoss: 10,
      netGainLoss: 0,
    }));
    expect(auditService.logEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'accounting.fx_revaluation.posted',
    }));
    expect(run.status).toBe('POSTED');
  });
});
