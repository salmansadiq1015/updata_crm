import { jest, test, expect } from '@jest/globals';

async function load() {
  jest.resetModules();
  const cache = { getOrSet: jest.fn(async (_key, fn) => fn()) };
  const accounts = { findAll: jest.fn(async () => [{ currency: 'CHF', currentBalance: 100 }, { currency: 'EUR', currentBalance: 900 }]) };
  const invoices = { find: jest.fn(() => ({ select: () => ({ lean: async () => [{ dueDate: new Date(), amountDue: 0, totalGross: 50 }] }) })) };
  jest.unstable_mockModule('../../src/shared/cache/CacheManager.js', () => ({ default: cache }));
  jest.unstable_mockModule('../../src/modules/accounting/bankAccount.repository.js', () => ({ default: accounts }));
  jest.unstable_mockModule('../../src/modules/qop/invoice.model.js', () => ({ default: invoices }));
  jest.unstable_mockModule('../../src/modules/accounting/apInvoice.repository.js', () => ({ default: { findForCashForecast: async () => [{ currency: 'CHF', outstandingAmount: 25, dueDate: new Date() }, { currency: 'EUR', outstandingAmount: 500, dueDate: new Date() }] } }));
  jest.unstable_mockModule('../../src/modules/accounting/fiscalPeriod.service.js', () => ({ default: {} }));
  jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({ default: {} }));
  jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({ default: { warn: jest.fn() } }));
  return { service: (await import('../../src/modules/accounting/cashManagement.service.js')).default, cache, invoices };
}
test('forecast separates currencies, includes today and respects zero outstanding balances', async () => {
  const { service, cache, invoices } = await load();
  const forecast = await service.getForecast({ days: 7, currency: 'CHF' });
  expect(cache.getOrSet.mock.calls[0][0]).toBe('accounting:cash:forecast:CHF:7');
  expect(forecast).toMatchObject({ currency: 'CHF', currentBalance: 100 });
  expect(forecast.projections[0]).toMatchObject({ inflows: 0, outflows: 25, netPosition: 75 });
  expect(invoices.find).toHaveBeenCalledWith(expect.objectContaining({ currency: 'CHF' }));
  expect(forecast.projections).toHaveLength(7);
});
