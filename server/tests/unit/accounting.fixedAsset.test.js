import { jest, describe, expect, test, beforeEach } from '@jest/globals';

async function loadFixedAssetService() {
  jest.resetModules();

  const session = {
    withTransaction: jest.fn(async (callback) => callback()),
    endSession: jest.fn(),
  };
  const repository = {
    createAsset: jest.fn(),
    updateAsset: jest.fn(),
    findById: jest.fn(),
    findWithFilters: jest.fn(),
    findDepreciationEntry: jest.fn(),
    createDepreciationEntry: jest.fn(),
    createDepreciationRun: jest.fn(),
    summarize: jest.fn(),
    summarizeDepreciation: jest.fn(),
  };
  const counterService = {
    getNextFixedAssetNumber: jest.fn(async () => 'FA-2026-00001'),
  };
  let journalSequence = 0;
  const journalEntryService = {
    createFromEvent: jest.fn(async () => {
      journalSequence += 1;
      return { _id: `journal-${journalSequence}` };
    }),
  };
  const ACCOUNT_MAPPING = {
    FIXED_ASSET: 'FIXED_ASSET',
    ACCUMULATED_DEPRECIATION: 'ACCUMULATED_DEPRECIATION',
    DEPRECIATION_EXPENSE: 'DEPRECIATION_EXPENSE',
    ASSET_ACQUISITION_CLEARING: 'ASSET_ACQUISITION_CLEARING',
    ASSET_DISPOSAL_CLEARING: 'ASSET_DISPOSAL_CLEARING',
    ASSET_DISPOSAL_GAIN: 'ASSET_DISPOSAL_GAIN',
    ASSET_DISPOSAL_LOSS: 'ASSET_DISPOSAL_LOSS',
    BANK_CLEARING: 'BANK_CLEARING',
  };
  const mappedAccounts = {
    FIXED_ASSET: 'fixed-asset-account',
    ACCUMULATED_DEPRECIATION: 'accumulated-depreciation-account',
    DEPRECIATION_EXPENSE: 'depreciation-expense-account',
    ASSET_ACQUISITION_CLEARING: 'asset-acquisition-clearing-account',
    ASSET_DISPOSAL_CLEARING: 'asset-disposal-clearing-account',
    ASSET_DISPOSAL_GAIN: 'asset-disposal-gain-account',
    ASSET_DISPOSAL_LOSS: 'asset-disposal-loss-account',
    BANK_CLEARING: 'bank-clearing-account',
  };
  const accountMappingService = {
    resolveGlobal: jest.fn(async (type) => mappedAccounts[type]),
  };
  const auditService = { logEvent: jest.fn() };

  jest.unstable_mockModule('mongoose', () => ({
    default: { startSession: jest.fn(async () => session) },
  }));
  jest.unstable_mockModule('../../src/modules/accounting/fixedAsset.repository.js', () => ({
    default: repository,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/accounting.counter.service.js', () => ({
    default: counterService,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/journalEntry.service.js', () => ({
    default: journalEntryService,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/accountMapping.service.js', () => ({
    default: accountMappingService,
    ACCOUNT_MAPPING,
  }));
  jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({
    default: auditService,
  }));

  const service = (await import('../../src/modules/accounting/fixedAsset.service.js')).default;
  return {
    service,
    session,
    repository,
    counterService,
    journalEntryService,
    accountMappingService,
    auditService,
  };
}

const baseAsset = {
  _id: '507f1f77bcf86cd799439011',
  assetNumber: 'FA-2026-00001',
  name: 'Boiler test rig',
  category: 'Equipment',
  acquisitionDate: new Date('2026-01-15T00:00:00.000Z'),
  placedInServiceDate: new Date('2026-02-01T00:00:00.000Z'),
  currency: 'CHF',
  acquisitionCost: 1200,
  salvageValue: 0,
  usefulLifeMonths: 12,
  depreciationMethod: 'STRAIGHT_LINE',
  accumulatedDepreciation: 100,
  bookValue: 1100,
  status: 'ACTIVE',
};

describe('fixed asset service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('creates draft assets with generated numbers and initial book value', async () => {
    const { service, repository, counterService, auditService } = await loadFixedAssetService();
    repository.createAsset.mockResolvedValue({ _id: 'asset-1', assetNumber: 'FA-2026-00001' });
    repository.findById.mockResolvedValue({ _id: 'asset-1', assetNumber: 'FA-2026-00001' });

    const result = await service.create({
      name: 'Compressor',
      acquisitionDate: '2026-01-01',
      currency: 'chf',
      acquisitionCost: 1000,
      salvageValue: 100,
      usefulLifeMonths: 60,
    }, 'user-1');

    expect(counterService.getNextFixedAssetNumber).toHaveBeenCalled();
    expect(repository.createAsset).toHaveBeenCalledWith(expect.objectContaining({
      assetNumber: 'FA-2026-00001',
      currency: 'CHF',
      accumulatedDepreciation: 0,
      bookValue: 1000,
      status: 'DRAFT',
      createdBy: 'user-1',
    }), expect.any(Object));
    expect(auditService.logEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'accounting.fixed_asset.created',
    }));
    expect(result.assetNumber).toBe('FA-2026-00001');
  });

  test('activates draft assets and posts acquisition journal', async () => {
    const { service, repository, journalEntryService, accountMappingService } = await loadFixedAssetService();
    repository.findById.mockResolvedValue({ ...baseAsset, status: 'DRAFT', accumulatedDepreciation: 0, bookValue: 1200 });
    repository.updateAsset.mockResolvedValue({ ...baseAsset, status: 'ACTIVE' });

    await service.activate(baseAsset._id, { placedInServiceDate: '2026-02-01' }, 'user-1');

    expect(accountMappingService.resolveGlobal).toHaveBeenCalledWith('FIXED_ASSET', expect.any(Object));
    expect(accountMappingService.resolveGlobal).toHaveBeenCalledWith('ASSET_ACQUISITION_CLEARING', expect.any(Object));
    expect(journalEntryService.createFromEvent).toHaveBeenCalledWith(
      'FIXED_ASSET_ACQUISITION',
      baseAsset._id,
      'fixed-asset-account',
      'asset-acquisition-clearing-account',
      1200,
      expect.stringContaining('Fixed asset acquisition'),
      'user-1',
      expect.objectContaining({ currency: 'CHF' }),
    );
    expect(repository.updateAsset).toHaveBeenCalledWith(
      baseAsset._id,
      expect.objectContaining({
        status: 'ACTIVE',
        acquisitionJournalEntryId: 'journal-1',
      }),
      expect.any(Object),
    );
  });

  test('posts straight-line depreciation once per period', async () => {
    const { service, repository, journalEntryService } = await loadFixedAssetService();
    repository.findById.mockResolvedValue(baseAsset);
    repository.findDepreciationEntry.mockResolvedValue(null);
    repository.createDepreciationEntry.mockResolvedValue({ _id: 'dep-1', amount: 100 });
    repository.createDepreciationRun.mockResolvedValue({ _id: 'run-1', totalAmount: 100 });
    repository.updateAsset.mockResolvedValue({
      ...baseAsset,
      accumulatedDepreciation: 200,
      bookValue: 1000,
    });

    const result = await service.depreciate(baseAsset._id, { periodDate: '2026-03-25' }, 'user-1');

    expect(repository.findDepreciationEntry).toHaveBeenCalledWith(
      baseAsset._id,
      new Date('2026-03-01T00:00:00.000Z'),
      expect.any(Object),
    );
    expect(journalEntryService.createFromEvent).toHaveBeenCalledWith(
      'FIXED_ASSET_DEPRECIATION',
      baseAsset._id,
      'depreciation-expense-account',
      'accumulated-depreciation-account',
      100,
      expect.stringContaining('Depreciation'),
      'user-1',
      expect.objectContaining({ currency: 'CHF' }),
    );
    expect(repository.createDepreciationEntry).toHaveBeenCalledWith(expect.objectContaining({
      amount: 100,
      accumulatedDepreciationAfter: 200,
      bookValueAfter: 1000,
      journalEntryId: 'journal-1',
    }), expect.any(Object));
    expect(result.asset.bookValue).toBe(1000);
  });

  test('rejects duplicate depreciation periods before posting journals', async () => {
    const { service, repository, journalEntryService } = await loadFixedAssetService();
    repository.findById.mockResolvedValue(baseAsset);
    repository.findDepreciationEntry.mockResolvedValue({ _id: 'dep-existing' });

    await expect(service.depreciate(baseAsset._id, { periodDate: '2026-03-01' }, 'user-1'))
      .rejects.toMatchObject({ statusCode: 409 });

    expect(journalEntryService.createFromEvent).not.toHaveBeenCalled();
  });

  test('disposes assets with derecognition, proceeds, and gain journal entries', async () => {
    const { service, repository, journalEntryService } = await loadFixedAssetService();
    const asset = {
      ...baseAsset,
      acquisitionCost: 1000,
      accumulatedDepreciation: 600,
      bookValue: 400,
      status: 'ACTIVE',
    };
    repository.findById.mockResolvedValue(asset);
    repository.updateAsset.mockResolvedValue({
      ...asset,
      status: 'DISPOSED',
      bookValue: 0,
      disposalGainLoss: 50,
    });

    await service.dispose(asset._id, { disposalDate: '2026-06-25', proceeds: 450 }, 'user-1');

    expect(journalEntryService.createFromEvent).toHaveBeenCalledTimes(4);
    expect(journalEntryService.createFromEvent).toHaveBeenNthCalledWith(
      1,
      'FIXED_ASSET_DISPOSAL',
      asset._id,
      'asset-disposal-clearing-account',
      'fixed-asset-account',
      1000,
      expect.stringContaining('Dispose asset cost'),
      'user-1',
      expect.objectContaining({ currency: 'CHF' }),
    );
    expect(journalEntryService.createFromEvent).toHaveBeenNthCalledWith(
      4,
      'FIXED_ASSET_DISPOSAL',
      asset._id,
      'asset-disposal-clearing-account',
      'asset-disposal-gain-account',
      50,
      expect.stringContaining('Asset disposal gain'),
      'user-1',
      expect.objectContaining({ currency: 'CHF' }),
    );
    expect(repository.updateAsset).toHaveBeenCalledWith(asset._id, expect.objectContaining({
      status: 'DISPOSED',
      disposalProceeds: 450,
      disposalGainLoss: 50,
      bookValue: 0,
      disposalJournalEntryIds: ['journal-1', 'journal-2', 'journal-3', 'journal-4'],
    }), expect.any(Object));
  });

  test('summarizes asset register and period depreciation totals', async () => {
    const { service, repository } = await loadFixedAssetService();
    repository.summarize.mockResolvedValue({
      acquisitionCost: 5000,
      accumulatedDepreciation: 1250,
      bookValue: 3750,
      count: 3,
      activeCount: 2,
      disposedCount: 1,
    });
    repository.summarizeDepreciation.mockResolvedValue({ totalAmount: 250, count: 2 });

    const result = await service.summary({
      currency: 'chf',
      startDate: '2026-01-01',
      endDate: '2026-06-30',
    });

    expect(repository.summarize).toHaveBeenCalledWith({ currency: 'CHF' });
    expect(repository.summarizeDepreciation).toHaveBeenCalledWith({
      currency: 'CHF',
      startDate: '2026-01-01',
      endDate: '2026-06-30',
    });
    expect(result).toEqual(expect.objectContaining({
      acquisitionCost: 5000,
      accumulatedDepreciation: 1250,
      bookValue: 3750,
      assetCount: 3,
      activeCount: 2,
      disposedCount: 1,
      periodDepreciation: 250,
    }));
  });
});
