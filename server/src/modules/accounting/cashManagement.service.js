import { roundCurrency } from '../../shared/data/currencies.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import fiscalPeriodService from './fiscalPeriod.service.js';
import auditService from '../auth/audit.service.js';
import logger from '../../shared/logger/index.js';

const BALANCES_TTL = { l1Ttl: 30, l2Ttl: 60 };
const FORECAST_TTL = { l1Ttl: 60, l2Ttl: 120 };

class CashManagementService {
  /**
   * Get current balances for all active bank accounts.
   * Uses cache-aside pattern.
   */
  async getBalances() {
    const cacheKey = 'accounting:cash:balances';

    return cacheManager.getOrSet(
      cacheKey,
      async () => {
        const bankAccountRepository = (await import('./bankAccount.repository.js')).default;
        const accounts = await bankAccountRepository.findAll();

        return accounts.map((acct) => ({
          accountId: acct._id,
          name: acct.name,
          iban: acct.iban,
          currency: acct.currency,
          balance: acct.currentBalance || 0,
          balanceDate: acct.balanceDate || null,
        }));
      },
      BALANCES_TTL,
    );
  }

  /**
   * Generate cash flow forecast for the specified number of days.
   * Combines AR inflows (invoices due) and AP outflows (payables due).
   */
  async getForecast({ days = 90, currency = 'CHF' } = {}) {
    const cacheKey = `accounting:cash:forecast:${currency}:${days}`;

    return cacheManager.getOrSet(
      cacheKey,
      async () => {
        // Get current bank balances
        const bankAccountRepository = (await import('./bankAccount.repository.js')).default;
        const accounts = (await bankAccountRepository.findAll()).filter(account => account.currency === currency);
        const currentBalance = accounts.reduce((sum, acct) => sum + (acct.currentBalance || 0), 0);

        const now = new Date();
        now.setUTCHours(0, 0, 0, 0);
        const endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000 - 1);

        // Get AR invoices due (inflows)
        let arInvoices = [];
        try {
          const Invoice = (await import('../qop/invoice.model.js')).default;
          arInvoices = await Invoice.find({
            currency,
            status: { $in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
            dueDate: { $gte: now, $lte: endDate },
          }).select('dueDate amountDue totalGross currency').lean();
        } catch {
          logger.warn('QOP Invoice model not available for cash forecast', {
            module: 'accounting',
            action: 'cash.forecast',
          });
        }

        // Get AP invoices due (outflows)
        let apInvoices = [];
        try {
          const apInvoiceRepository = (await import('./apInvoice.repository.js')).default;
          apInvoices = await apInvoiceRepository.findForCashForecast(
            now.toISOString(),
            endDate.toISOString(),
            currency,
          );
          apInvoices = apInvoices.filter(invoice => invoice.currency === currency);
        } catch {
          logger.warn('AP invoice repository not available for cash forecast', {
            module: 'accounting',
            action: 'cash.forecast',
          });
        }

        // Build daily projections
        const projections = [];
        let runningBalance = currentBalance;

        for (let d = 0; d < days; d++) {
          const date = new Date(now.getTime() + d * 24 * 60 * 60 * 1000);
          const dateStr = date.toISOString().split('T')[0];

          // Sum inflows for this day
          const inflows = arInvoices
            .filter((inv) => new Date(inv.dueDate).toISOString().split('T')[0] === dateStr)
            .reduce((sum, inv) => sum + (inv.amountDue ?? inv.totalGross ?? 0), 0);

          // Sum outflows for this day
          const outflows = apInvoices
            .filter((inv) => new Date(inv.dueDate).toISOString().split('T')[0] === dateStr)
            .reduce((sum, inv) => sum + (inv.outstandingAmount ?? inv.totalAmount ?? 0), 0);

          runningBalance = runningBalance + inflows - outflows;

          projections.push({
            date: dateStr,
            inflows: roundCurrency(inflows, currency),
            outflows: roundCurrency(outflows, currency),
            netPosition: roundCurrency(runningBalance, currency),
          });
        }

        return {
          currency,
          currentBalance: roundCurrency(currentBalance, currency),
          projections,
        };
      },
      FORECAST_TTL,
    );
  }

  /**
   * Manually update a bank account balance.
   */
  async updateManualBalance(bankAccountId, balance, date, userId, meta = {}) {
    const bankAccountRepository = (await import('./bankAccount.repository.js')).default;
    await fiscalPeriodService.assertPostingDateOpen(date);

    const updated = await bankAccountRepository.updateBalance(bankAccountId, balance, new Date(date));

    // Invalidate caches
    await cacheManager.del('accounting:cash:balances');
    await cacheManager.del('accounting:bank:accounts');
    await cacheManager.invalidatePattern('accounting:cash:forecast:*');

    auditService.logEvent({
      eventType: 'accounting.cash.manual_balance',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { bankAccountId, balance, date },
      module: 'accounting',
    });

    logger.info('Manual balance updated', {
      module: 'accounting',
      action: 'cash.manual_balance',
      bankAccountId,
      balance,
    });

    return updated;
  }
}

const cashManagementService = new CashManagementService();
export default cashManagementService;
