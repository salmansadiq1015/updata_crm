import accountMappingRepository from './accountMapping.repository.js';
import accountRepository from './account.repository.js';
import auditService from '../auth/audit.service.js';
import { AppError, NotFoundError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';

export const ACCOUNT_MAPPING = Object.freeze({
  AR_RECEIVABLE: 'AR_RECEIVABLE',
  SALES_REVENUE: 'SALES_REVENUE',
  BANK_CLEARING: 'BANK_CLEARING',
  WRITE_OFF_EXPENSE: 'WRITE_OFF_EXPENSE',
  AP_PAYABLE: 'AP_PAYABLE',
  BANK_FEE_EXPENSE: 'BANK_FEE_EXPENSE',
  FIXED_ASSET: 'FIXED_ASSET',
  ACCUMULATED_DEPRECIATION: 'ACCUMULATED_DEPRECIATION',
  DEPRECIATION_EXPENSE: 'DEPRECIATION_EXPENSE',
  ASSET_ACQUISITION_CLEARING: 'ASSET_ACQUISITION_CLEARING',
  ASSET_DISPOSAL_CLEARING: 'ASSET_DISPOSAL_CLEARING',
  ASSET_DISPOSAL_GAIN: 'ASSET_DISPOSAL_GAIN',
  ASSET_DISPOSAL_LOSS: 'ASSET_DISPOSAL_LOSS',
  FX_UNREALIZED_GAIN: 'FX_UNREALIZED_GAIN',
  FX_UNREALIZED_LOSS: 'FX_UNREALIZED_LOSS',
  INVENTORY_ASSET: 'INVENTORY_ASSET',
  INVENTORY_ADJUSTMENT_GAIN: 'INVENTORY_ADJUSTMENT_GAIN',
  INVENTORY_ADJUSTMENT_LOSS: 'INVENTORY_ADJUSTMENT_LOSS',
});

function mappingLabel(mappingType) {
  return String(mappingType || '').toLowerCase().replaceAll('_', ' ');
}

class AccountMappingService {
  async upsert(data, userId, meta = {}) {
    const account = await accountRepository.findById(data.accountId);
    if (!account) throw new NotFoundError('Account', data.accountId);
    if (account.isGroup || account.isActive === false) {
      throw new AppError(
        'Account mappings must point to an active posting account',
        400,
        ERROR_CODES.ACCT_ACCOUNT_IS_GROUP,
      );
    }

    const mapping = await accountMappingRepository.upsert({
      ...data,
      scopeType: data.scopeType || 'GLOBAL',
      scopeValue: data.scopeType === 'GLOBAL' ? '' : (data.scopeValue || ''),
      createdBy: userId,
      updatedBy: userId,
    });

    auditService.logEvent({
      eventType: 'account_mapping.upserted',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: {
        mappingType: mapping.mappingType,
        scopeType: mapping.scopeType,
        scopeValue: mapping.scopeValue,
        accountId: mapping.accountId,
      },
      module: 'accounting',
    });

    return mapping;
  }

  async list(filters = {}) {
    return accountMappingRepository.findWithFilters(filters);
  }

  async resolveRequired(mappingType, options = {}) {
    const mapping = await accountMappingRepository.findBest(mappingType, options);
    if (!mapping) {
      throw new AppError(
        `Missing accounting account mapping for ${mappingLabel(mappingType)}`,
        409,
        ERROR_CODES.ACCT_ACCOUNT_MAPPING_NOT_FOUND,
      );
    }

    const account = await accountRepository.findById(mapping.accountId, { session: options.session });
    if (!account || account.isGroup || account.isActive === false) {
      throw new AppError(
        `Invalid accounting account mapping for ${mappingLabel(mappingType)}`,
        409,
        ERROR_CODES.ACCT_ACCOUNT_MAPPING_INVALID,
      );
    }

    return account._id;
  }

  async resolveGlobal(mappingType, options = {}) {
    return this.resolveRequired(mappingType, {
      ...options,
      scopeType: 'GLOBAL',
      scopeValue: '',
    });
  }
}

const accountMappingService = new AccountMappingService();
export default accountMappingService;
