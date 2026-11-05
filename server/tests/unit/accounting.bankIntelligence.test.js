import { describe, expect, test } from '@jest/globals';
import { parseBankStatementCsv } from '../../src/modules/accounting/bankStatementCsv.parser.js';
import { matchBankCategoryRule } from '../../src/modules/accounting/bankCategoryRules.js';
import { bankingAnalyticsSchema } from '../../src/modules/accounting/banking.validation.js';
const account = { iban: 'CH9300762011623852957', currency: 'CHF' };
const header = 'date,amount,currency,description,reference,counterparty\n';
const row = '2026-11-01,-12.50,CHF,"Fee, monthly",FEE-1,Bank\n';
describe('bank CSV imports', () => {
  test('preserves signed values, ISO dates, quoted descriptions and currency', () => {
    expect(parseBankStatementCsv(Buffer.from(header + row), account)).toMatchObject({ accountIban: account.iban, statementId: expect.stringMatching(/^CSV-/), transactions: [{ amount: -12.5, currency: 'CHF', bookingText: 'Fee, monthly', reference: 'FEE-1', payerPayeeName: 'Bank', transactionDate: new Date('2026-11-01'), valueDate: new Date('2026-11-01') }] });
  });
  test('normalizes BOM and CRLF for stable duplicate detection', () => {
    expect(parseBankStatementCsv(Buffer.from('\ufeff' + (header + row).replaceAll('\n', '\r\n')), account).statementId).toBe(parseBankStatementCsv(Buffer.from(header + row), account).statementId);
  });
  test.each(['2026-02-30,10,CHF,Fee,,Bank\n', '2026-11-01,NaN,CHF,Fee,,Bank\n', '2026-11-01,1.234,CHF,Fee,,Bank\n', '2026-11-01,10,EUR,Fee,,Bank\n', '2026-11-01,10,CHF,,,Bank\n'])('rejects invalid rows before writing: %s', value => {
    expect(() => parseBankStatementCsv(Buffer.from(header + value), account)).toThrow();
  });
  test('rejects empty files and missing columns', () => {
    expect(() => parseBankStatementCsv(Buffer.from(header), account)).toThrow();
    expect(() => parseBankStatementCsv(Buffer.from('foo,bar\na,b'), account)).toThrow();
  });
});
describe('bank category rules', () => {
  const rules = [{ keyword: 'monthly fee', direction: 'OUT', accountId: 'fees' }];
  test('matches literal keywords with direction and case folding', () => {
    expect(matchBankCategoryRule({ amount: -12, bookingText: 'Monthly Fee November' }, rules)).toBe('fees');
    expect(matchBankCategoryRule({ amount: 12, bookingText: 'Monthly Fee refund' }, rules)).toBeNull();
    expect(matchBankCategoryRule({ amount: 0, bookingText: 'Monthly Fee' }, rules)).toBeNull();
  });
  test('leaves conflicting accounts for review', () => {
    const tx = { amount: -12, bookingText: 'Monthly fee' };
    expect(matchBankCategoryRule(tx, [...rules, { keyword: 'fee', direction: 'OUT', accountId: 'other' }])).toBeNull();
    expect(matchBankCategoryRule(tx, [...rules, { keyword: 'fee', direction: 'OUT', accountId: 'fees' }])).toBe('fees');
  });
  test('rejects reversed analytics dates', () => {
    expect(bankingAnalyticsSchema.query.validate({ dateFrom: '2026-11-05', dateTo: '2026-11-01' }).error).toBeDefined();
  });
});
