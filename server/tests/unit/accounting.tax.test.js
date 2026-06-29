import { jest, describe, expect, test, beforeEach } from '@jest/globals';

async function loadTaxService() {
  jest.resetModules();

  const repository = {
    createCode: jest.fn(),
    updateCode: jest.fn(),
    findCodeById: jest.fn(),
    findCodeByCode: jest.fn(),
    findCodes: jest.fn(),
    createGroup: jest.fn(),
    findGroups: jest.fn(),
    createExemption: jest.fn(),
    findExemptions: jest.fn(),
    findExemptionByCode: jest.fn(),
    replaceTransactionsForSource: jest.fn(),
    findTransactions: jest.fn(),
    summarizeTransactions: jest.fn(),
  };
  const auditService = { logEvent: jest.fn() };

  jest.unstable_mockModule('../../src/modules/accounting/tax.repository.js', () => ({
    default: repository,
  }));
  jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({
    default: auditService,
  }));

  const service = (await import('../../src/modules/accounting/tax.service.js')).default;
  return { service, repository, auditService };
}

describe('tax service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('creates normalized tax codes and writes an audit event', async () => {
    const { service, repository, auditService } = await loadTaxService();
    repository.createCode.mockResolvedValue({
      _id: 'tax-1',
      code: 'VAT81',
      rate: 8.1,
    });

    const result = await service.createCode({
      code: ' vat81 ',
      name: 'Swiss VAT',
      rate: 8.1,
      validFrom: '2026-01-01',
    }, 'user-1', { ipAddress: '127.0.0.1', userAgent: 'jest' });

    expect(repository.createCode).toHaveBeenCalledWith(expect.objectContaining({
      code: 'VAT81',
      type: 'VAT',
      direction: 'BOTH',
      scope: 'STANDARD',
      country: 'CH',
      createdBy: 'user-1',
    }));
    expect(auditService.logEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'accounting.tax_code.created',
      userId: 'user-1',
      module: 'accounting',
    }));
    expect(result.code).toBe('VAT81');
  });

  test('calculates legacy VAT totals when no managed tax code is present', async () => {
    const { service, repository } = await loadTaxService();

    const result = await service.calculateDocument({
      lineItems: [{ position: 1, description: 'Service', lineTotal: 100, vatRate: 8.1 }],
      documentDate: '2026-01-01',
      currency: 'chf',
      direction: 'input',
    });

    expect(repository.findCodeByCode).not.toHaveBeenCalled();
    expect(result.currency).toBe('CHF');
    expect(result.lines[0]).toEqual(expect.objectContaining({
      taxCode: 'VAT_8_1',
      taxRate: 8.1,
      taxableAmount: 100,
      taxAmount: 8.1,
      recoverableAmount: 8.1,
      grossAmount: 108.1,
    }));
    expect(result.totals).toEqual(expect.objectContaining({
      taxableAmount: 100,
      taxAmount: 8.1,
      grossAmount: 108.1,
    }));
  });

  test('applies valid exemptions as zero-rated tax lines', async () => {
    const { service, repository } = await loadTaxService();
    repository.findExemptionByCode.mockResolvedValue({
      code: 'EXPORT',
      reason: 'Export sale',
      validFrom: new Date('2026-01-01'),
      validTo: null,
    });

    const result = await service.calculateDocument({
      lineItems: [{ position: 1, lineTotal: 1000, vatRate: 8.1 }],
      documentDate: '2026-06-25',
      currency: 'CHF',
      direction: 'OUTPUT',
      exemptionCode: ' export ',
    });

    expect(repository.findExemptionByCode).toHaveBeenCalledWith('EXPORT');
    expect(result.exemption).toEqual({ code: 'EXPORT', reason: 'Export sale' });
    expect(result.lines[0]).toEqual(expect.objectContaining({
      taxCode: 'TAX_ZERO',
      taxAmount: 0,
      grossAmount: 1000,
      exemptionCode: 'EXPORT',
    }));
  });

  test('calculates withholding as a deduction from gross settlement amount', async () => {
    const { service, repository } = await loadTaxService();
    repository.findCodeByCode.mockResolvedValue({
      _id: 'tax-wh5',
      code: 'WH5',
      name: 'Withholding 5%',
      type: 'WITHHOLDING',
      direction: 'WITHHOLDING',
      scope: 'WITHHOLDING',
      country: 'CH',
      rate: 5,
      recoverablePercent: 0,
      validFrom: new Date('2026-01-01'),
      validTo: null,
      isActive: true,
    });

    const result = await service.calculateDocument({
      lineItems: [{ position: 1, lineTotal: 1000, taxCode: 'WH5' }],
      documentDate: '2026-06-25',
      currency: 'CHF',
      direction: 'WITHHOLDING',
    });

    expect(result.lines[0]).toEqual(expect.objectContaining({
      taxCode: 'WH5',
      taxAmount: 50,
      grossAmount: 950,
    }));
  });

  test('records AP invoice tax ledger rows by replacing source transactions', async () => {
    const { service, repository } = await loadTaxService();
    repository.replaceTransactionsForSource.mockResolvedValue([{ _id: 'tx-1' }]);

    await service.recordFromApInvoice({
      _id: '507f1f77bcf86cd799439011',
      apInvoiceNumber: 'AP-100',
      supplierId: '507f1f77bcf86cd799439012',
      supplierName: 'Supplier AG',
      invoiceDate: '2026-06-25',
      currency: 'CHF',
      lineItems: [{ position: 1, description: 'Materials', lineTotal: 200, vatRate: 8.1 }],
    }, '507f1f77bcf86cd799439013');

    expect(repository.replaceTransactionsForSource).toHaveBeenCalledWith(
      'AP_INVOICE',
      '507f1f77bcf86cd799439011',
      [expect.objectContaining({
        sourceType: 'AP_INVOICE',
        sourceNumber: 'AP-100',
        direction: 'INPUT',
        taxCode: 'VAT_8_1',
        taxableAmount: 200,
        taxAmount: 16.2,
        recoverableAmount: 16.2,
      })],
      {},
    );
  });

  test('summarizes output, input, withholding, and net payable tax', async () => {
    const { service, repository } = await loadTaxService();
    repository.summarizeTransactions.mockResolvedValue([
      {
        _id: { direction: 'OUTPUT', taxCode: 'VAT_8_1', taxRate: 8.1, currency: 'CHF' },
        taxableAmount: 1000,
        taxAmount: 81,
        recoverableAmount: 0,
        nonRecoverableAmount: 0,
        grossAmount: 1081,
        count: 2,
      },
      {
        _id: { direction: 'INPUT', taxCode: 'VAT_8_1', taxRate: 8.1, currency: 'CHF' },
        taxableAmount: 200,
        taxAmount: 16.2,
        recoverableAmount: 16.2,
        nonRecoverableAmount: 0,
        grossAmount: 216.2,
        count: 1,
      },
      {
        _id: { direction: 'WITHHOLDING', taxCode: 'WH5', taxRate: 5, currency: 'CHF' },
        taxableAmount: 500,
        taxAmount: 25,
        recoverableAmount: 0,
        nonRecoverableAmount: 0,
        grossAmount: 475,
        count: 1,
      },
    ]);

    const result = await service.getSummary({
      startDate: '2026-01-01',
      endDate: '2026-06-30',
      currency: 'chf',
    });

    expect(repository.summarizeTransactions).toHaveBeenCalledWith({
      startDate: '2026-01-01',
      endDate: '2026-06-30',
      currency: 'CHF',
    });
    expect(result).toEqual(expect.objectContaining({
      outputTax: 81,
      inputTax: 16.2,
      withholdingTax: 25,
      netTaxPayable: 89.8,
    }));
  });
});
