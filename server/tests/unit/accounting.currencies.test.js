import { test, expect, describe } from '@jest/globals';
import { CURRENCY_CODES, currencyDigits } from '../../src/shared/data/currencies.js';
import { createBankAccountSchema, bankingAnalyticsSchema } from '../../src/modules/accounting/banking.validation.js';
import { createJournalSchema } from '../../src/modules/accounting/journalEntry.validation.js';
import { parseBankStatementCsv } from '../../src/modules/accounting/bankStatementCsv.parser.js';
import BankAccount from '../../src/modules/accounting/bankAccount.model.js';
import JournalEntry from '../../src/modules/accounting/journalEntry.model.js';

const iban = 'CH9300762011623852957';
describe('global monetary currency catalog', () => {
  test('every supported ISO code passes bank creation, storage and analytics validation', () => {
    expect(CURRENCY_CODES.length).toBeGreaterThan(160);
    for (const currency of CURRENCY_CODES) {
      expect(createBankAccountSchema.body.validate({ name: 'International', iban, currency }).error).toBeUndefined();
      expect(new BankAccount({ name: 'International', iban, currency }).validateSync()).toBeUndefined();
      expect(bankingAnalyticsSchema.query.validate({ currency, dateFrom: '2026-11-01', dateTo: '2026-11-05' }).error).toBeUndefined();
    }
  });
  test('unrecognized codes cannot create bank or ledger records', () => {
    expect(createBankAccountSchema.body.validate({ name: 'Invalid', iban, currency: 'ZZZ' }).error).toBeDefined();
    expect(new BankAccount({ name: 'Invalid', iban, currency: 'ZZZ' }).validateSync()).toBeDefined();
  });
  test.each([['JPY', '125', 125], ['PKR', '-12.50', -12.5], ['KWD', '1.234', 1.234], ['CLF', '1.2345', 1.2345]])('CSV preserves %s minor units', (currency, amount, expected) => {
    const csv = Buffer.from(`date,amount,currency,description\n2026-11-01,${amount},${currency},Bank fee\n`);
    expect(parseBankStatementCsv(csv, { iban, currency }).transactions[0].amount).toBe(expected);
  });
  test('CSV rejects fractional yen and excess dinar precision', () => {
    for (const [currency, amount] of [['JPY', '1.25'], ['KWD', '1.2345']]) {
      expect(() => parseBankStatementCsv(Buffer.from(`date,amount,currency,description\n2026-11-01,${amount},${currency},Fee`), { iban, currency })).toThrow();
    }
    expect(currencyDigits('JPY')).toBe(0);
    expect(currencyDigits('KWD')).toBe(3);
  });
  test('sub-cent dinar journals pass validation and preserve the currency', () => {
    const data = { entryDate: '2026-11-01', description: 'Dinar precision', debitAccountId: '507f1f77bcf86cd799439011', creditAccountId: '507f1f77bcf86cd799439012', amount: 0.001, currency: 'KWD' };
    expect(createJournalSchema.body.validate(data).error).toBeUndefined();
    expect(new JournalEntry({ ...data, entryNumber: 1, referenceType: 'MANUAL' }).validateSync()).toBeUndefined();
  });
});

test('payment XML preserves dinar precision in amounts and control sums', async () => {
  const { generatePain001 } = await import('../../src/modules/accounting/iso20022.parser.js');
  const xml = generatePain001({ batchNumber: 'PB-KWD', totalAmount: 1.234, invoiceCount: 1, currency: 'KWD' }, { name: 'Bank', iban, currency: 'KWD' }, [{ amount: 1.234, currency: 'KWD', creditorName: 'Supplier', creditorIban: iban }]);
  expect(xml).toContain('<CtrlSum>1.234</CtrlSum>');
  expect(xml).toContain('<InstdAmt Ccy="KWD">1.234</InstdAmt>');
  expect(xml).not.toContain('<Cd>SEPA</Cd>');
});
