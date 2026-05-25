import { jest, describe, expect, test } from '@jest/globals';
import ERROR_CODES from '../../src/shared/errors/errorCodes.js';

async function loadAccountMappingService({
  account = { _id: 'account-1', isGroup: false, isActive: true },
  mapping = { _id: 'mapping-1', mappingType: 'AR_RECEIVABLE', accountId: 'account-1' },
} = {}) {
  jest.resetModules();

  const accountRepository = {
    findById: jest.fn(async () => account),
  };
  const accountMappingRepository = {
    upsert: jest.fn(async (data) => ({ _id: 'mapping-1', ...data })),
    findBest: jest.fn(async () => mapping),
    findWithFilters: jest.fn(async () => [mapping]),
  };
  const auditService = { logEvent: jest.fn() };

  jest.unstable_mockModule('../../src/modules/accounting/account.repository.js', () => ({
    default: accountRepository,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/accountMapping.repository.js', () => ({
    default: accountMappingRepository,
  }));
  jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({
    default: auditService,
  }));

  const service = (await import('../../src/modules/accounting/accountMapping.service.js')).default;

  return {
    service,
    accountRepository,
    accountMappingRepository,
    auditService,
  };
}

describe('account mapping service', () => {
  test('upserts mappings only to active posting accounts', async () => {
    const { service, accountRepository, accountMappingRepository, auditService } =
      await loadAccountMappingService();

    const mapping = await service.upsert({
      mappingType: 'AR_RECEIVABLE',
      scopeType: 'GLOBAL',
      accountId: 'account-1',
    }, 'user-1');

    expect(accountRepository.findById).toHaveBeenCalledWith('account-1');
    expect(accountMappingRepository.upsert).toHaveBeenCalledWith(expect.objectContaining({
      mappingType: 'AR_RECEIVABLE',
      scopeType: 'GLOBAL',
      scopeValue: '',
      accountId: 'account-1',
      createdBy: 'user-1',
      updatedBy: 'user-1',
    }));
    expect(auditService.logEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'account_mapping.upserted',
      module: 'accounting',
    }));
    expect(mapping.mappingType).toBe('AR_RECEIVABLE');
  });

  test('rejects mappings to group accounts', async () => {
    const { service, accountMappingRepository } = await loadAccountMappingService({
      account: { _id: 'account-1', isGroup: true, isActive: true },
    });

    await expect(service.upsert({
      mappingType: 'AR_RECEIVABLE',
      accountId: 'account-1',
    }, 'user-1')).rejects.toMatchObject({
      statusCode: 400,
      code: ERROR_CODES.ACCT_ACCOUNT_IS_GROUP,
    });

    expect(accountMappingRepository.upsert).not.toHaveBeenCalled();
  });

  test('resolves required mappings and rejects missing configuration', async () => {
    const { service, accountMappingRepository } = await loadAccountMappingService();

    await expect(service.resolveRequired('AR_RECEIVABLE')).resolves.toBe('account-1');

    accountMappingRepository.findBest.mockResolvedValueOnce(null);
    await expect(service.resolveRequired('SALES_REVENUE')).rejects.toMatchObject({
      statusCode: 409,
      code: ERROR_CODES.ACCT_ACCOUNT_MAPPING_NOT_FOUND,
    });
  });
});
