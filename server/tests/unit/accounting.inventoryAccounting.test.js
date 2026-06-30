import { jest, describe, expect, test, beforeEach } from '@jest/globals';

async function loadInventoryAccountingService() {
  jest.resetModules();

  const inventoryAccountingRepository = {
    findStockParts: jest.fn(),
    findMovementById: jest.fn(),
    findUnpostedMovements: jest.fn(),
    findEntryByMovement: jest.fn(),
    createEntry: jest.fn(),
    updateEntry: jest.fn(),
    listEntries: jest.fn(),
  };
  const journalEntryService = { createFromEvent: jest.fn() };
  const accountMappingService = { resolveGlobal: jest.fn() };
  const auditService = { logEvent: jest.fn() };

  jest.unstable_mockModule('../../src/modules/accounting/inventoryAccounting.repository.js', () => ({
    default: inventoryAccountingRepository,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/journalEntry.service.js', () => ({
    default: journalEntryService,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/accountMapping.service.js', () => ({
    default: accountMappingService,
    ACCOUNT_MAPPING: {
      INVENTORY_ASSET: 'INVENTORY_ASSET',
      INVENTORY_ADJUSTMENT_GAIN: 'INVENTORY_ADJUSTMENT_GAIN',
      INVENTORY_ADJUSTMENT_LOSS: 'INVENTORY_ADJUSTMENT_LOSS',
    },
  }));
  jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({
    default: auditService,
  }));

  const service = (await import('../../src/modules/accounting/inventoryAccounting.service.js')).default;
  return {
    service,
    inventoryAccountingRepository,
    journalEntryService,
    accountMappingService,
    auditService,
  };
}

const sparePart = {
  _id: '507f1f77bcf86cd799439041',
  partNumber: 'P-100',
  name: 'Pump seal',
  category: 'pump_part',
  currentStock: 5,
  unitPrice: 12.5,
  currency: 'CHF',
  unit: 'pcs',
};

const incomingMovement = {
  _id: '507f1f77bcf86cd799439042',
  sparePartId: sparePart,
  type: 'receipt',
  quantity: 2,
  createdAt: new Date('2026-06-30T00:00:00.000Z'),
};

const outgoingMovement = {
  ...incomingMovement,
  _id: '507f1f77bcf86cd799439043',
  type: 'issue',
  quantity: -2,
};

describe('inventory accounting service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('values stock using selected costing method and current unit cost', async () => {
    const { service, inventoryAccountingRepository } = await loadInventoryAccountingService();
    inventoryAccountingRepository.findStockParts.mockResolvedValue([sparePart]);

    const result = await service.valuation({ currency: 'chf', costingMethod: 'fifo' });

    expect(inventoryAccountingRepository.findStockParts).toHaveBeenCalledWith(expect.objectContaining({
      currency: 'CHF',
    }));
    expect(result).toEqual(expect.objectContaining({
      currency: 'CHF',
      costingMethod: 'FIFO',
      totalValue: 62.5,
      lineCount: 1,
    }));
    expect(result.lines[0]).toEqual(expect.objectContaining({
      partNumber: 'P-100',
      quantity: 5,
      unitCost: 12.5,
      valuationAmount: 62.5,
    }));
  });

  test('posts incoming inventory movements as asset debit and adjustment gain credit', async () => {
    const {
      service,
      inventoryAccountingRepository,
      journalEntryService,
      accountMappingService,
      auditService,
    } = await loadInventoryAccountingService();
    inventoryAccountingRepository.findEntryByMovement.mockResolvedValue(null);
    inventoryAccountingRepository.findMovementById.mockResolvedValue(incomingMovement);
    inventoryAccountingRepository.createEntry.mockResolvedValue({ _id: 'entry-1' });
    inventoryAccountingRepository.updateEntry.mockResolvedValue({ _id: 'entry-1', journalEntryId: 'journal-1' });
    accountMappingService.resolveGlobal
      .mockResolvedValueOnce('inventory-asset')
      .mockResolvedValueOnce('inventory-gain')
      .mockResolvedValueOnce('inventory-loss');
    journalEntryService.createFromEvent.mockResolvedValue({ _id: 'journal-1' });

    const result = await service.postMovement(incomingMovement._id, { costingMethod: 'WEIGHTED_AVERAGE' }, 'user-1');

    expect(inventoryAccountingRepository.createEntry).toHaveBeenCalledWith(expect.objectContaining({
      movementId: incomingMovement._id,
      quantity: 2,
      unitCost: 12.5,
      valuationAmount: 25,
      currency: 'CHF',
      createdBy: 'user-1',
    }));
    expect(journalEntryService.createFromEvent).toHaveBeenCalledWith(
      'INVENTORY_VALUATION',
      'entry-1',
      'inventory-asset',
      'inventory-gain',
      25,
      'Inventory increase P-100',
      'user-1',
      expect.objectContaining({ currency: 'CHF' }),
    );
    expect(auditService.logEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'accounting.inventory_movement.posted',
    }));
    expect(result.journalEntryId).toBe('journal-1');
  });

  test('posts outgoing inventory movements as adjustment loss debit and asset credit', async () => {
    const {
      service,
      inventoryAccountingRepository,
      journalEntryService,
      accountMappingService,
    } = await loadInventoryAccountingService();
    inventoryAccountingRepository.findEntryByMovement.mockResolvedValue(null);
    inventoryAccountingRepository.findMovementById.mockResolvedValue(outgoingMovement);
    inventoryAccountingRepository.createEntry.mockResolvedValue({ _id: 'entry-2' });
    inventoryAccountingRepository.updateEntry.mockResolvedValue({ _id: 'entry-2', journalEntryId: 'journal-2' });
    accountMappingService.resolveGlobal
      .mockResolvedValueOnce('inventory-asset')
      .mockResolvedValueOnce('inventory-gain')
      .mockResolvedValueOnce('inventory-loss');
    journalEntryService.createFromEvent.mockResolvedValue({ _id: 'journal-2' });

    await service.postMovement(outgoingMovement._id, {}, 'user-1');

    expect(journalEntryService.createFromEvent).toHaveBeenCalledWith(
      'INVENTORY_VALUATION',
      'entry-2',
      'inventory-loss',
      'inventory-asset',
      25,
      'Inventory decrease P-100',
      'user-1',
      expect.objectContaining({ currency: 'CHF' }),
    );
  });

  test('rejects duplicate inventory movement postings', async () => {
    const { service, inventoryAccountingRepository } = await loadInventoryAccountingService();
    inventoryAccountingRepository.findEntryByMovement.mockResolvedValue({ _id: 'entry-1' });

    await expect(service.postMovement(incomingMovement._id, {}, 'user-1')).rejects.toMatchObject({
      statusCode: 409,
      code: 'ACCT_INVENTORY_MOVEMENT_ALREADY_POSTED',
    });
  });
});
