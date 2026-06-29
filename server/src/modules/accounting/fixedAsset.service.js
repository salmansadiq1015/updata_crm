import mongoose from 'mongoose';
import fixedAssetRepository from './fixedAsset.repository.js';
import counterService from './accounting.counter.service.js';
import journalEntryService from './journalEntry.service.js';
import accountMappingService, { ACCOUNT_MAPPING } from './accountMapping.service.js';
import auditService from '../auth/audit.service.js';
import { AppError, ConflictError, NotFoundError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function normalizeCurrency(value) {
  return String(value || 'CHF').trim().toUpperCase();
}

function normalizeStatus(value) {
  return value ? String(value).trim().toUpperCase() : undefined;
}

function monthStart(value) {
  const date = value ? new Date(value) : new Date();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function assertAssetState(asset, allowed, action) {
  if (!allowed.includes(asset.status)) {
    throw new AppError(
      `Fixed asset ${asset.assetNumber} cannot be ${action} while ${asset.status.toLowerCase()}`,
      409,
      ERROR_CODES.ACCT_FIXED_ASSET_INVALID_STATE,
      [{ assetId: asset._id, status: asset.status, action }],
    );
  }
}

class FixedAssetService {
  async create(data, userId, meta = {}) {
    const session = await mongoose.startSession();
    let asset;

    try {
      await session.withTransaction(async () => {
        const assetNumber = data.assetNumber || await counterService.getNextFixedAssetNumber({ session });
        asset = await fixedAssetRepository.createAsset({
          ...data,
          assetNumber,
          currency: normalizeCurrency(data.currency),
          accumulatedDepreciation: 0,
          bookValue: roundMoney(data.acquisitionCost),
          status: 'DRAFT',
          createdBy: userId,
        }, { session });
      });
    } finally {
      await session.endSession();
    }

    auditService.logEvent({
      eventType: 'accounting.fixed_asset.created',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { assetId: asset._id, assetNumber: asset.assetNumber },
      module: 'accounting',
    });

    return fixedAssetRepository.findById(asset._id);
  }

  async list(filters = {}) {
    return fixedAssetRepository.findWithFilters({
      ...filters,
      status: normalizeStatus(filters.status),
      currency: filters.currency ? normalizeCurrency(filters.currency) : undefined,
    });
  }

  async getById(id) {
    const asset = await fixedAssetRepository.findById(id);
    if (!asset) throw new NotFoundError('FixedAsset', id);
    return asset;
  }

  async update(id, data, userId, meta = {}) {
    const asset = await this.getById(id);
    if (asset.status === 'DISPOSED') {
      throw new AppError(
        'Disposed fixed assets cannot be edited',
        409,
        ERROR_CODES.ACCT_FIXED_ASSET_INVALID_STATE,
      );
    }

    const financialFields = [
      'acquisitionCost',
      'salvageValue',
      'usefulLifeMonths',
      'depreciationMethod',
      'acquisitionDate',
    ];
    if (asset.status !== 'DRAFT' && financialFields.some((field) => data[field] !== undefined)) {
      throw new AppError(
        'Financial fixed asset fields can only be edited while draft',
        409,
        ERROR_CODES.ACCT_FIXED_ASSET_INVALID_STATE,
      );
    }

    const update = {
      ...data,
      currency: data.currency ? normalizeCurrency(data.currency) : undefined,
      updatedBy: userId,
    };
    if (asset.status === 'DRAFT' && data.acquisitionCost !== undefined) {
      update.bookValue = roundMoney(data.acquisitionCost);
      update.accumulatedDepreciation = 0;
    }

    const updated = await fixedAssetRepository.updateAsset(id, update);

    auditService.logEvent({
      eventType: 'accounting.fixed_asset.updated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { assetId: id, changedFields: Object.keys(data) },
      module: 'accounting',
    });

    return updated;
  }

  async activate(id, data = {}, userId, meta = {}) {
    const session = await mongoose.startSession();
    let updated;

    try {
      await session.withTransaction(async () => {
        const asset = await this.getById(id);
        assertAssetState(asset, ['DRAFT'], 'activated');
        const entryDate = data.placedInServiceDate || asset.placedInServiceDate || asset.acquisitionDate;
        const accounts = await this._resolveActivationAccounts(asset, { session });

        const journal = await journalEntryService.createFromEvent(
          'FIXED_ASSET_ACQUISITION',
          asset._id,
          accounts.assetAccountId,
          accounts.acquisitionClearingAccountId,
          asset.acquisitionCost,
          `Fixed asset acquisition: ${asset.assetNumber} ${asset.name}`,
          userId,
          { session, entryDate, currency: asset.currency },
        );

        updated = await fixedAssetRepository.updateAsset(id, {
          status: 'ACTIVE',
          placedInServiceDate: entryDate,
          bookValue: roundMoney(asset.acquisitionCost),
          acquisitionJournalEntryId: journal._id,
          updatedBy: userId,
        }, { session });
      });
    } finally {
      await session.endSession();
    }

    auditService.logEvent({
      eventType: 'accounting.fixed_asset.activated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { assetId: id },
      module: 'accounting',
    });

    return updated;
  }

  async depreciate(id, data = {}, userId, meta = {}) {
    const session = await mongoose.startSession();
    let result;

    try {
      await session.withTransaction(async () => {
        const asset = await this.getById(id);
        assertAssetState(asset, ['ACTIVE'], 'depreciated');
        const periodDate = monthStart(data.periodDate);
        if (asset.placedInServiceDate && periodDate < monthStart(asset.placedInServiceDate)) {
          throw new AppError(
            'Depreciation period cannot be before placed-in-service date',
            400,
            ERROR_CODES.ACCT_FIXED_ASSET_DEPRECIATION_INVALID,
          );
        }
        const existing = await fixedAssetRepository.findDepreciationEntry(asset._id, periodDate, { session });
        if (existing) throw new ConflictError('Fixed asset depreciation already posted for this period');

        const amount = this._calculateDepreciationAmount(asset);
        if (amount <= 0) {
          throw new AppError(
            'Fixed asset has no remaining depreciable amount',
            409,
            ERROR_CODES.ACCT_FIXED_ASSET_DEPRECIATION_INVALID,
          );
        }

        const accounts = await this._resolveDepreciationAccounts(asset, { session });
        const journal = await journalEntryService.createFromEvent(
          'FIXED_ASSET_DEPRECIATION',
          asset._id,
          accounts.depreciationExpenseAccountId,
          accounts.accumulatedDepreciationAccountId,
          amount,
          `Depreciation: ${asset.assetNumber} ${asset.name}`,
          userId,
          { session, entryDate: periodDate, currency: asset.currency },
        );

        const accumulatedDepreciation = roundMoney(Number(asset.accumulatedDepreciation || 0) + amount);
        const bookValue = roundMoney(Math.max(0, Number(asset.acquisitionCost || 0) - accumulatedDepreciation));
        const status = bookValue <= Number(asset.salvageValue || 0) ? 'FULLY_DEPRECIATED' : 'ACTIVE';

        const entry = await fixedAssetRepository.createDepreciationEntry({
          assetId: asset._id,
          assetNumber: asset.assetNumber,
          periodDate,
          amount,
          accumulatedDepreciationAfter: accumulatedDepreciation,
          bookValueAfter: bookValue,
          currency: asset.currency,
          journalEntryId: journal._id,
          createdBy: userId,
        }, { session });

        const run = await fixedAssetRepository.createDepreciationRun({
          periodDate,
          assetCount: 1,
          totalAmount: amount,
          currency: asset.currency,
          assetIds: [asset._id],
          entryIds: [entry._id],
          createdBy: userId,
        }, { session });

        const updated = await fixedAssetRepository.updateAsset(asset._id, {
          accumulatedDepreciation,
          bookValue,
          lastDepreciationDate: periodDate,
          status,
          updatedBy: userId,
        }, { session });

        result = { asset: updated, entry, run };
      });
    } finally {
      await session.endSession();
    }

    auditService.logEvent({
      eventType: 'accounting.fixed_asset.depreciated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { assetId: id, amount: result.entry.amount },
      module: 'accounting',
    });

    return result;
  }

  async dispose(id, data = {}, userId, meta = {}) {
    const session = await mongoose.startSession();
    let updated;

    try {
      await session.withTransaction(async () => {
        const asset = await this.getById(id);
        assertAssetState(asset, ['ACTIVE', 'FULLY_DEPRECIATED'], 'disposed');
        const disposalDate = data.disposalDate || new Date();
        const proceeds = roundMoney(data.proceeds || 0);
        const accounts = await this._resolveDisposalAccounts(asset, { session });
        const journalIds = [];

        if (asset.acquisitionCost > 0) {
          const journal = await journalEntryService.createFromEvent(
            'FIXED_ASSET_DISPOSAL',
            asset._id,
            accounts.disposalClearingAccountId,
            accounts.assetAccountId,
            asset.acquisitionCost,
            `Dispose asset cost: ${asset.assetNumber} ${asset.name}`,
            userId,
            { session, entryDate: disposalDate, currency: asset.currency },
          );
          journalIds.push(journal._id);
        }

        if (Number(asset.accumulatedDepreciation || 0) > 0) {
          const journal = await journalEntryService.createFromEvent(
            'FIXED_ASSET_DISPOSAL',
            asset._id,
            accounts.accumulatedDepreciationAccountId,
            accounts.disposalClearingAccountId,
            asset.accumulatedDepreciation,
            `Clear accumulated depreciation: ${asset.assetNumber} ${asset.name}`,
            userId,
            { session, entryDate: disposalDate, currency: asset.currency },
          );
          journalIds.push(journal._id);
        }

        if (proceeds > 0) {
          const journal = await journalEntryService.createFromEvent(
            'FIXED_ASSET_DISPOSAL',
            asset._id,
            accounts.bankClearingAccountId,
            accounts.disposalClearingAccountId,
            proceeds,
            `Record asset disposal proceeds: ${asset.assetNumber} ${asset.name}`,
            userId,
            { session, entryDate: disposalDate, currency: asset.currency },
          );
          journalIds.push(journal._id);
        }

        const gainLoss = roundMoney(proceeds - Number(asset.bookValue || 0));
        if (gainLoss > 0) {
          const journal = await journalEntryService.createFromEvent(
            'FIXED_ASSET_DISPOSAL',
            asset._id,
            accounts.disposalClearingAccountId,
            accounts.disposalGainAccountId,
            gainLoss,
            `Asset disposal gain: ${asset.assetNumber} ${asset.name}`,
            userId,
            { session, entryDate: disposalDate, currency: asset.currency },
          );
          journalIds.push(journal._id);
        } else if (gainLoss < 0) {
          const journal = await journalEntryService.createFromEvent(
            'FIXED_ASSET_DISPOSAL',
            asset._id,
            accounts.disposalLossAccountId,
            accounts.disposalClearingAccountId,
            Math.abs(gainLoss),
            `Asset disposal loss: ${asset.assetNumber} ${asset.name}`,
            userId,
            { session, entryDate: disposalDate, currency: asset.currency },
          );
          journalIds.push(journal._id);
        }

        updated = await fixedAssetRepository.updateAsset(id, {
          status: 'DISPOSED',
          disposalDate,
          disposalProceeds: proceeds,
          disposalGainLoss: gainLoss,
          disposalJournalEntryIds: journalIds,
          bookValue: 0,
          updatedBy: userId,
        }, { session });
      });
    } finally {
      await session.endSession();
    }

    auditService.logEvent({
      eventType: 'accounting.fixed_asset.disposed',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { assetId: id, proceeds: data.proceeds, gainLoss: updated.disposalGainLoss },
      module: 'accounting',
    });

    return updated;
  }

  async summary(filters = {}) {
    const currency = filters.currency ? normalizeCurrency(filters.currency) : undefined;
    const assetSummary = await fixedAssetRepository.summarize({ currency });
    const depreciationSummary = await fixedAssetRepository.summarizeDepreciation({
      currency,
      startDate: filters.startDate,
      endDate: filters.endDate,
    });

    return {
      currency: currency || null,
      acquisitionCost: roundMoney(assetSummary.acquisitionCost),
      accumulatedDepreciation: roundMoney(assetSummary.accumulatedDepreciation),
      bookValue: roundMoney(assetSummary.bookValue),
      assetCount: assetSummary.count || 0,
      activeCount: assetSummary.activeCount || 0,
      disposedCount: assetSummary.disposedCount || 0,
      periodDepreciation: roundMoney(depreciationSummary.totalAmount),
      depreciationEntryCount: depreciationSummary.count || 0,
    };
  }

  _calculateDepreciationAmount(asset) {
    const depreciableBase = roundMoney(Number(asset.acquisitionCost || 0) - Number(asset.salvageValue || 0));
    const monthlyAmount = roundMoney(depreciableBase / Number(asset.usefulLifeMonths || 1));
    const remaining = roundMoney(depreciableBase - Number(asset.accumulatedDepreciation || 0));
    return roundMoney(Math.min(monthlyAmount, remaining));
  }

  async _resolveActivationAccounts(asset, options = {}) {
    return {
      assetAccountId: asset.assetAccountId || await accountMappingService.resolveGlobal(ACCOUNT_MAPPING.FIXED_ASSET, options),
      acquisitionClearingAccountId: await accountMappingService.resolveGlobal(ACCOUNT_MAPPING.ASSET_ACQUISITION_CLEARING, options),
    };
  }

  async _resolveDepreciationAccounts(asset, options = {}) {
    return {
      accumulatedDepreciationAccountId: asset.accumulatedDepreciationAccountId || await accountMappingService.resolveGlobal(ACCOUNT_MAPPING.ACCUMULATED_DEPRECIATION, options),
      depreciationExpenseAccountId: asset.depreciationExpenseAccountId || await accountMappingService.resolveGlobal(ACCOUNT_MAPPING.DEPRECIATION_EXPENSE, options),
    };
  }

  async _resolveDisposalAccounts(asset, options = {}) {
    return {
      assetAccountId: asset.assetAccountId || await accountMappingService.resolveGlobal(ACCOUNT_MAPPING.FIXED_ASSET, options),
      accumulatedDepreciationAccountId: asset.accumulatedDepreciationAccountId || await accountMappingService.resolveGlobal(ACCOUNT_MAPPING.ACCUMULATED_DEPRECIATION, options),
      disposalClearingAccountId: await accountMappingService.resolveGlobal(ACCOUNT_MAPPING.ASSET_DISPOSAL_CLEARING, options),
      disposalGainAccountId: asset.disposalGainAccountId || await accountMappingService.resolveGlobal(ACCOUNT_MAPPING.ASSET_DISPOSAL_GAIN, options),
      disposalLossAccountId: asset.disposalLossAccountId || await accountMappingService.resolveGlobal(ACCOUNT_MAPPING.ASSET_DISPOSAL_LOSS, options),
      bankClearingAccountId: await accountMappingService.resolveGlobal(ACCOUNT_MAPPING.BANK_CLEARING, options),
    };
  }
}

const fixedAssetService = new FixedAssetService();
export default fixedAssetService;
