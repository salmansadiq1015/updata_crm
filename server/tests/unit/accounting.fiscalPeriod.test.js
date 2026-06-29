import { jest, describe, expect, test } from '@jest/globals';

async function loadFiscalPeriodService({ overlap = null, coveringPeriod = null } = {}) {
  jest.resetModules();

  const fiscalPeriodRepository = {
    findAll: jest.fn(async () => []),
    findById: jest.fn(),
    findOverlapping: jest.fn(async () => overlap),
    findCoveringDate: jest.fn(async () => coveringPeriod),
    create: jest.fn(async (data) => ({ _id: 'period-new', ...data })),
    updateById: jest.fn(),
  };
  const auditService = { logEvent: jest.fn() };

  jest.unstable_mockModule('../../src/modules/accounting/fiscalPeriod.repository.js', () => ({
    default: fiscalPeriodRepository,
  }));
  jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({
    default: auditService,
  }));
  jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
    default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  }));

  const ERROR_CODES = (await import('../../src/shared/errors/errorCodes.js')).default;
  const service = (await import('../../src/modules/accounting/fiscalPeriod.service.js')).default;
  return { service, fiscalPeriodRepository, auditService, ERROR_CODES };
}

describe('fiscal period service', () => {
  test('rejects overlapping fiscal periods', async () => {
    const { service, fiscalPeriodRepository, ERROR_CODES } = await loadFiscalPeriodService({
      overlap: { _id: 'period-existing' },
    });

    await expect(service.create({
      name: 'FY 2026',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    }, 'user-1')).rejects.toMatchObject({
      statusCode: 409,
      code: ERROR_CODES.ACCT_PERIOD_OVERLAP,
    });
    expect(fiscalPeriodRepository.create).not.toHaveBeenCalled();
  });

  test('blocks posting dates in closed fiscal periods', async () => {
    const { service, fiscalPeriodRepository, ERROR_CODES } = await loadFiscalPeriodService({
      coveringPeriod: { _id: 'period-closed', status: 'CLOSED' },
    });

    await expect(service.assertPostingDateOpen('2026-03-15')).rejects.toMatchObject({
      statusCode: 409,
      code: ERROR_CODES.ACCT_PERIOD_CLOSED,
    });
    expect(fiscalPeriodRepository.findCoveringDate).toHaveBeenCalledWith(
      new Date('2026-03-15'),
      {},
    );
  });

  test('allows posting when no covering fiscal period exists for legacy data', async () => {
    const { service } = await loadFiscalPeriodService({ coveringPeriod: null });

    await expect(service.assertPostingDateOpen('2026-03-15')).resolves.toBeNull();
  });
});
