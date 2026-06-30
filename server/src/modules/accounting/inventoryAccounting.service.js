import inventoryAccountingRepository from './inventoryAccounting.repository.js';
import journalEntryService from './journalEntry.service.js';
import accountMappingService, { ACCOUNT_MAPPING } from './accountMapping.service.js';
import auditService from '../auth/audit.service.js';
import { AppError, NotFoundError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';

const COSTING_METHODS = ['FIFO', 'LIFO', 'WEIGHTED_AVERAGE'];

function normalizeCurrency(value) {
  return String(value || 'CHF').trim().toUpperCase();
}

function normalizeCostingMethod(value) {
  const normalized = String(value || 'WEIGHTED_AVERAGE').trim().toUpperCase();
  return COSTING_METHODS.includes(normalized) ? normalized : 'WEIGHTED_AVERAGE';
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function unitCost(part) {
  return roundMoney(part?.unitPrice || 0);
}

function movementPart(movement) {
  return movement?.sparePartId && typeof movement.sparePartId === 'object'
    ? movement.sparePartId
    : null;
}

function movementValuationLine(movement, costingMethod) {
  const part = movementPart(movement);
  if (!part) {
    throw new AppError(
      'Inventory movement is missing its spare part reference',
      400,
      ERROR_CODES.ACCT_INVENTORY_VALUATION_INVALID,
      [{ movementId: movement?._id }],
    );
  }

  const cost = unitCost(part);
  const quantity = Number(movement.quantity || 0);
  return {
    movementId: movement._id,
    sparePartId: part._id,
    partNumber: part.partNumber || '',
    partName: part.name,
    category: part.category || 'other',
    movementType: movement.type,
    costingMethod,
    quantity,
    unitCost: cost,
    valuationAmount: roundMoney(Math.abs(quantity) * cost),
    currency: normalizeCurrency(part.currency),
    movementDate: movement.createdAt,
  };
}

class InventoryAccountingService {
  async valuation(query = {}) {
    const currency = query.currency ? normalizeCurrency(query.currency) : undefined;
    const costingMethod = normalizeCostingMethod(query.costingMethod);
    const parts = await inventoryAccountingRepository.findStockParts({
      currency,
      category: query.category,
      limit: query.limit || 1000,
    });

    const lines = parts.map((part) => {
      const cost = unitCost(part);
      const quantity = Number(part.currentStock || 0);
      return {
        sparePartId: part._id,
        partNumber: part.partNumber || '',
        partName: part.name,
        category: part.category || 'other',
        quantity,
        unit: part.unit || 'pcs',
        unitCost: cost,
        valuationAmount: roundMoney(quantity * cost),
        currency: normalizeCurrency(part.currency),
        costingMethod,
      };
    });

    return {
      currency: currency || null,
      costingMethod,
      lineCount: lines.length,
      totalValue: roundMoney(lines.reduce((sum, line) => sum + line.valuationAmount, 0)),
      zeroCostCount: lines.filter((line) => line.unitCost === 0).length,
      lines,
    };
  }

  async movements(query = {}) {
    const costingMethod = normalizeCostingMethod(query.costingMethod);
    const movements = await inventoryAccountingRepository.findUnpostedMovements({
      startDate: query.startDate,
      endDate: query.endDate,
      type: query.type,
      limit: query.limit || 250,
    });
    const lines = movements
      .map((movement) => movementValuationLine(movement, costingMethod))
      .filter((line) => !query.currency || line.currency === normalizeCurrency(query.currency));

    return {
      costingMethod,
      lineCount: lines.length,
      totalIncoming: roundMoney(lines.filter((line) => line.quantity > 0).reduce((sum, line) => sum + line.valuationAmount, 0)),
      totalOutgoing: roundMoney(lines.filter((line) => line.quantity < 0).reduce((sum, line) => sum + line.valuationAmount, 0)),
      lines,
    };
  }

  async postMovement(movementId, options = {}, userId, meta = {}) {
    const existing = await inventoryAccountingRepository.findEntryByMovement(movementId);
    if (existing) {
      throw new AppError(
        'Inventory movement has already been posted to accounting',
        409,
        ERROR_CODES.ACCT_INVENTORY_MOVEMENT_ALREADY_POSTED,
        [{ movementId, entryId: existing._id }],
      );
    }

    const movement = await inventoryAccountingRepository.findMovementById(movementId);
    if (!movement) throw new NotFoundError('InventoryMovement', movementId);

    const costingMethod = normalizeCostingMethod(options.costingMethod);
    const line = movementValuationLine(movement, costingMethod);
    if (line.valuationAmount <= 0) {
      throw new AppError(
        'Inventory movement valuation amount must be greater than zero',
        400,
        ERROR_CODES.ACCT_INVENTORY_VALUATION_INVALID,
        [{ movementId }],
      );
    }

    const entry = await inventoryAccountingRepository.createEntry({
      movementId: line.movementId,
      sparePartId: line.sparePartId,
      partNumber: line.partNumber,
      partName: line.partName,
      movementType: line.movementType,
      costingMethod,
      quantity: line.quantity,
      unitCost: line.unitCost,
      valuationAmount: line.valuationAmount,
      currency: line.currency,
      createdBy: userId,
    });

    const mappings = await this._resolveMappings();
    const isIncrease = line.quantity > 0;
    const debitAccountId = isIncrease ? mappings.inventoryAssetAccountId : mappings.inventoryAdjustmentLossAccountId;
    const creditAccountId = isIncrease ? mappings.inventoryAdjustmentGainAccountId : mappings.inventoryAssetAccountId;
    const journal = await journalEntryService.createFromEvent(
      'INVENTORY_VALUATION',
      entry._id,
      debitAccountId,
      creditAccountId,
      line.valuationAmount,
      `Inventory ${isIncrease ? 'increase' : 'decrease'} ${line.partNumber || line.partName}`,
      userId,
      {
        entryDate: movement.createdAt || new Date(),
        currency: line.currency,
      },
    );

    const updated = await inventoryAccountingRepository.updateEntry(entry._id, {
      journalEntryId: journal._id,
    });

    auditService.logEvent({
      eventType: 'accounting.inventory_movement.posted',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: {
        movementId,
        inventoryAccountingEntryId: updated._id,
        journalEntryId: journal._id,
        valuationAmount: line.valuationAmount,
      },
      module: 'accounting',
    });

    return updated;
  }

  async postPeriod(data = {}, userId, meta = {}) {
    const preview = await this.movements(data);
    const results = [];
    for (const line of preview.lines) {
      try {
        results.push({
          movementId: line.movementId,
          status: 'POSTED',
          entry: await this.postMovement(line.movementId, { costingMethod: preview.costingMethod }, userId, meta),
        });
      } catch (err) {
        results.push({
          movementId: line.movementId,
          status: 'FAILED',
          errorMessage: err.message,
        });
      }
    }

    return {
      processed: results.length,
      posted: results.filter((result) => result.status === 'POSTED').length,
      failed: results.filter((result) => result.status === 'FAILED').length,
      results,
    };
  }

  async entries(filters = {}) {
    return inventoryAccountingRepository.listEntries({
      ...filters,
      currency: filters.currency ? normalizeCurrency(filters.currency) : undefined,
      costingMethod: filters.costingMethod ? normalizeCostingMethod(filters.costingMethod) : undefined,
    });
  }

  async _resolveMappings() {
    const [
      inventoryAssetAccountId,
      inventoryAdjustmentGainAccountId,
      inventoryAdjustmentLossAccountId,
    ] = await Promise.all([
      accountMappingService.resolveGlobal(ACCOUNT_MAPPING.INVENTORY_ASSET),
      accountMappingService.resolveGlobal(ACCOUNT_MAPPING.INVENTORY_ADJUSTMENT_GAIN),
      accountMappingService.resolveGlobal(ACCOUNT_MAPPING.INVENTORY_ADJUSTMENT_LOSS),
    ]);
    return {
      inventoryAssetAccountId,
      inventoryAdjustmentGainAccountId,
      inventoryAdjustmentLossAccountId,
    };
  }
}

const inventoryAccountingService = new InventoryAccountingService();
export default inventoryAccountingService;
