import { jest, describe, expect, test } from '@jest/globals';

function chainResult(docs) {
  const chain = {
    sort: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    populate: jest.fn(() => chain),
    select: jest.fn(() => chain),
    lean: jest.fn(async () => docs),
  };
  return chain;
}

async function loadSearchService({
  accounts = [],
  journalEntries = [],
  arInvoices = [],
  apInvoices = [],
  bankTransactions = [],
  documents = [],
} = {}) {
  jest.resetModules();

  const Account = { find: jest.fn(() => chainResult(accounts)) };
  const JournalEntry = { find: jest.fn(() => chainResult(journalEntries)) };
  const Invoice = { find: jest.fn(() => chainResult(arInvoices)) };
  const ApInvoice = { find: jest.fn(() => chainResult(apInvoices)) };
  const BankTransaction = { find: jest.fn(() => chainResult(bankTransactions)) };
  const AccountingDocument = { find: jest.fn(() => chainResult(documents)) };

  jest.unstable_mockModule('../../src/modules/accounting/account.model.js', () => ({ default: Account }));
  jest.unstable_mockModule('../../src/modules/accounting/journalEntry.model.js', () => ({ default: JournalEntry }));
  jest.unstable_mockModule('../../src/modules/qop/invoice.model.js', () => ({ default: Invoice }));
  jest.unstable_mockModule('../../src/modules/accounting/apInvoice.model.js', () => ({ default: ApInvoice }));
  jest.unstable_mockModule('../../src/modules/accounting/bankTransaction.model.js', () => ({ default: BankTransaction }));
  jest.unstable_mockModule('../../src/modules/accounting/accountingDocument.model.js', () => ({ default: AccountingDocument }));

  const service = (await import('../../src/modules/accounting/accountingSearch.service.js')).default;
  return {
    service,
    models: { Account, JournalEntry, Invoice, ApInvoice, BankTransaction, AccountingDocument },
  };
}

describe('accounting search service', () => {
  test('normalizes multi-source financial search results', async () => {
    const { service, models } = await loadSearchService({
      accounts: [{
        _id: 'account-1',
        accountNumber: '1020',
        name: 'Bank CHF',
        type: 'ASSET',
        isGroup: false,
        isActive: true,
        createdAt: new Date('2026-01-01'),
      }],
      journalEntries: [{
        _id: 'journal-1',
        entryNumber: 42,
        entryDate: new Date('2026-04-03'),
        description: 'Invoice posting INV-100',
        debitAccountId: { accountNumber: '1020', name: 'Bank CHF' },
        creditAccountId: { accountNumber: '3400', name: 'Sales' },
        amount: 250,
        currency: 'CHF',
        referenceType: 'AR_INVOICE',
      }],
      arInvoices: [{
        _id: 'ar-1',
        invoiceNumber: 'INV-100',
        title: 'Installation invoice',
        customerName: 'Customer AG',
        status: 'SENT',
        amountDue: 250,
        currency: 'CHF',
        invoiceDate: new Date('2026-04-02'),
      }],
      apInvoices: [{
        _id: 'ap-1',
        apInvoiceNumber: 'AP-100',
        supplierInvoiceNumber: 'SUP-100',
        supplierName: 'Supplier AG',
        status: 'APPROVED',
        outstandingAmount: 180,
        currency: 'CHF',
        invoiceDate: new Date('2026-04-01'),
      }],
      bankTransactions: [{
        _id: 'bank-1',
        transactionDate: new Date('2026-04-04'),
        amount: 250,
        currency: 'CHF',
        reference: 'INV-100',
        payerPayeeName: 'Customer AG',
        bookingText: 'Payment INV-100',
        reconciliationStatus: 'AUTO_MATCHED',
      }],
      documents: [{
        _id: 'doc-1',
        fileName: 'invoice-inv-100.pdf',
        documentType: 'AR_INVOICE_PDF',
        processingStatus: 'PROCESSED',
        ocrStatus: 'COMPLETED',
        amount: 250,
        createdAt: new Date('2026-04-02'),
      }],
    });

    const result = await service.search({
      q: 'INV-100',
      currency: 'CHF',
      startDate: '2026-04-01',
      endDate: '2026-04-30',
      minAmount: 100,
      maxAmount: 300,
      limit: 10,
    });

    expect(result.data.map((item) => item.type)).toEqual(expect.arrayContaining([
      'ACCOUNT',
      'JOURNAL_ENTRY',
      'AR_INVOICE',
      'AP_INVOICE',
      'BANK_TRANSACTION',
      'DOCUMENT',
    ]));
    expect(result.data[0]).toEqual(expect.objectContaining({
      type: 'BANK_TRANSACTION',
      reference: 'INV-100',
      href: '/accounting/bank?transactionId=bank-1',
    }));
    expect(result.meta.returned).toBe(6);
    expect(models.JournalEntry.find).toHaveBeenCalledWith(expect.objectContaining({
      currency: 'CHF',
    }));
    expect(models.BankTransaction.find).toHaveBeenCalledWith(expect.objectContaining({
      currency: 'CHF',
    }));
  });

  test('restricts search to the requested source type', async () => {
    const { service, models } = await loadSearchService({
      apInvoices: [{
        _id: 'ap-1',
        apInvoiceNumber: 'AP-100',
        supplierInvoiceNumber: 'SUP-100',
        supplierName: 'Supplier AG',
        status: 'APPROVED',
        totalAmount: 100,
        currency: 'CHF',
        invoiceDate: new Date('2026-03-01'),
      }],
    });

    const result = await service.search({ q: 'SUP-100', type: 'AP_INVOICE', limit: 5 });

    expect(result.data).toEqual([
      expect.objectContaining({
        type: 'AP_INVOICE',
        reference: 'AP-100',
      }),
    ]);
    expect(models.ApInvoice.find).toHaveBeenCalledTimes(1);
    expect(models.Invoice.find).not.toHaveBeenCalled();
    expect(models.JournalEntry.find).not.toHaveBeenCalled();
    expect(models.BankTransaction.find).not.toHaveBeenCalled();
  });
});
