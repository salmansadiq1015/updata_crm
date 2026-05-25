import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { jest, beforeAll, afterAll, beforeEach, describe, expect, test } from '@jest/globals';

jest.unstable_mockModule('../../src/shared/events/EventBus.js', () => ({
  default: { publish: jest.fn() },
}));

jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({
  default: { logEvent: jest.fn() },
}));

jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

let replSet;
let Account;
let AccountMapping;
let AccountingDocument;
let ApInvoice;
let ArPayment;
let ArPaymentAllocation;
let BankTransaction;
let Counter;
let Invoice;
let JournalEntry;
let PaymentBatch;
let User;
let apInvoiceService;
let arReceivablesService;
let journalEntryService;
let openItemsService;
let reconciliationService;

const ids = {
  user: new mongoose.Types.ObjectId(),
  customer: new mongoose.Types.ObjectId(),
  supplier: new mongoose.Types.ObjectId(),
  bankAccount: new mongoose.Types.ObjectId(),
};

async function createAccount({ numberPrefix, name, type }) {
  return Account.create({
    accountNumber: `${numberPrefix}${new mongoose.Types.ObjectId().toString().slice(-4)}`.slice(0, 10),
    name,
    type,
    createdBy: ids.user,
  });
}

async function createPostingAccounts() {
  const [debit, credit] = await Promise.all([
    createAccount({ numberPrefix: '1020', name: 'Bank CHF', type: 'ASSET' }),
    createAccount({ numberPrefix: '1100', name: 'Receivables', type: 'ASSET' }),
  ]);

  return { debit, credit };
}

async function createRequiredMappings() {
  const [bankClearing, receivable, revenue, writeOffExpense, apPayable] = await Promise.all([
    createAccount({ numberPrefix: '1021', name: 'Bank clearing', type: 'ASSET' }),
    createAccount({ numberPrefix: '1101', name: 'Receivables control', type: 'ASSET' }),
    createAccount({ numberPrefix: '3200', name: 'Sales revenue', type: 'REVENUE' }),
    createAccount({ numberPrefix: '6900', name: 'Write-off expense', type: 'EXPENSE' }),
    createAccount({ numberPrefix: '2000', name: 'Payables control', type: 'LIABILITY' }),
  ]);

  await AccountMapping.create([
    {
      mappingType: 'BANK_CLEARING',
      accountId: bankClearing._id,
      createdBy: ids.user,
    },
    {
      mappingType: 'AR_RECEIVABLE',
      accountId: receivable._id,
      createdBy: ids.user,
    },
    {
      mappingType: 'SALES_REVENUE',
      accountId: revenue._id,
      createdBy: ids.user,
    },
    {
      mappingType: 'WRITE_OFF_EXPENSE',
      accountId: writeOffExpense._id,
      createdBy: ids.user,
    },
    {
      mappingType: 'AP_PAYABLE',
      accountId: apPayable._id,
      createdBy: ids.user,
    },
  ]);

  return { bankClearing, receivable, revenue, writeOffExpense, apPayable };
}

async function createOpenInvoice(amountDue = 100) {
  return Invoice.create({
    invoiceNumber: `RE-2026-${new mongoose.Types.ObjectId().toString().slice(-6)}`,
    invoiceType: 'STANDARD',
    customerId: ids.customer,
    customerName: 'Concurrency Customer AG',
    lineItems: [{
      position: 1,
      description: 'Service work',
      quantity: 1,
      unitPrice: amountDue,
      vatRate: 0,
    }],
    subtotal: amountDue,
    grandTotal: amountDue,
    grandTotalRounded: amountDue,
    amountPaid: 0,
    amountDue,
    invoiceDate: new Date('2026-05-01T00:00:00.000Z'),
    dueDate: new Date('2026-05-31T00:00:00.000Z'),
    status: 'SENT',
    createdBy: ids.user,
  });
}

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });

  await mongoose.connect(replSet.getUri(), {
    dbName: 'accounting-transactions',
  });

  ({ default: Account } = await import('../../src/modules/accounting/account.model.js'));
  ({ default: AccountMapping } = await import('../../src/modules/accounting/accountMapping.model.js'));
  ({ default: AccountingDocument } = await import('../../src/modules/accounting/accountingDocument.model.js'));
  ({ default: ApInvoice } = await import('../../src/modules/accounting/apInvoice.model.js'));
  ({ default: ArPayment } = await import('../../src/modules/accounting/arPayment.model.js'));
  ({ default: ArPaymentAllocation } = await import('../../src/modules/accounting/arPaymentAllocation.model.js'));
  ({ default: BankTransaction } = await import('../../src/modules/accounting/bankTransaction.model.js'));
  ({ default: Counter } = await import('../../src/modules/crm/counter.model.js'));
  ({ default: Invoice } = await import('../../src/modules/qop/invoice.model.js'));
  ({ default: JournalEntry } = await import('../../src/modules/accounting/journalEntry.model.js'));
  ({ default: PaymentBatch } = await import('../../src/modules/accounting/paymentBatch.model.js'));
  ({ default: User } = await import('../../src/modules/auth/user.model.js'));
  ({ default: apInvoiceService } = await import('../../src/modules/accounting/apInvoice.service.js'));
  ({ default: arReceivablesService } = await import('../../src/modules/accounting/arReceivables.service.js'));
  ({ default: journalEntryService } = await import('../../src/modules/accounting/journalEntry.service.js'));
  ({ default: openItemsService } = await import('../../src/modules/accounting/openItems.service.js'));
  ({ default: reconciliationService } = await import('../../src/modules/accounting/reconciliation.service.js'));

  await Promise.all([
    Account.syncIndexes(),
    AccountMapping.syncIndexes(),
    AccountingDocument.syncIndexes(),
    ApInvoice.syncIndexes(),
    ArPayment.syncIndexes(),
    ArPaymentAllocation.syncIndexes(),
    BankTransaction.syncIndexes(),
    Counter.syncIndexes(),
    Invoice.syncIndexes(),
    JournalEntry.syncIndexes(),
    PaymentBatch.syncIndexes(),
    User.syncIndexes(),
  ]);
});

beforeEach(async () => {
  const collections = Object.values(mongoose.connection.collections);
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
});

describe('accounting Mongo transaction integrity', () => {
  test('aborted journal transaction rolls back entry creation and the consumed counter', async () => {
    const { debit, credit } = await createPostingAccounts();
    const session = await mongoose.startSession();

    await expect(session.withTransaction(async () => {
      await journalEntryService.createFromEvent(
        'MANUAL',
        new mongoose.Types.ObjectId(),
        debit._id,
        credit._id,
        125,
        'Rollback probe',
        ids.user,
        { session },
      );

      throw new Error('force rollback');
    })).rejects.toThrow('force rollback');

    await session.endSession();

    expect(await JournalEntry.countDocuments()).toBe(0);
    expect(await Counter.findById(`accounting:journal:${new Date().getFullYear()}`).lean()).toBeNull();

    const committed = await journalEntryService.createManual({
      entryDate: new Date('2026-05-12T00:00:00.000Z'),
      description: 'Committed entry',
      debitAccountId: debit._id,
      creditAccountId: credit._id,
      amount: 125,
    }, ids.user);

    expect(committed.entryNumber).toBe(1);
    expect(await JournalEntry.countDocuments()).toBe(1);
  });

  test('racing journal reversals commit exactly one reversal', async () => {
    const { debit, credit } = await createPostingAccounts();
    const original = await journalEntryService.createManual({
      entryDate: new Date('2026-05-12T00:00:00.000Z'),
      description: 'Original posting',
      debitAccountId: debit._id,
      creditAccountId: credit._id,
      amount: 75,
    }, ids.user);

    const results = await Promise.allSettled([
      journalEntryService.reverse(original._id, 'Correction', ids.user),
      journalEntryService.reverse(original._id, 'Correction', ids.user),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ statusCode: 409 });

    const entries = await JournalEntry.find().sort({ entryNumber: 1 }).lean();
    const refreshedOriginal = await JournalEntry.findById(original._id).lean();

    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.entryNumber)).toEqual([1, 2]);
    expect(entries[1].referenceType).toBe('REVERSAL');
    expect(String(refreshedOriginal.reversedBy)).toBe(String(entries[1]._id));
  });

  test('racing AR allocations leave one committed allocation and consistent balances', async () => {
    const invoice = await createOpenInvoice(100);
    const payment = await ArPayment.create({
      paymentDate: new Date('2026-05-12T00:00:00.000Z'),
      amount: 100,
      currency: 'CHF',
      customerId: ids.customer,
      paymentReference: 'BANK-REF-1',
      source: 'MANUAL',
      allocatedAmount: 0,
      unallocatedAmount: 100,
      createdBy: ids.user,
    });

    const allocation = [{ invoiceId: invoice._id, amount: 100 }];
    const results = await Promise.allSettled([
      arReceivablesService.allocatePayment(payment._id, allocation, ids.user),
      arReceivablesService.allocatePayment(payment._id, allocation, ids.user),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);

    const refreshedPayment = await ArPayment.findById(payment._id).lean();
    const refreshedInvoice = await Invoice.findById(invoice._id).lean();
    const allocationCount = await ArPaymentAllocation.countDocuments({ paymentId: payment._id });

    expect(allocationCount).toBe(1);
    expect(refreshedPayment.allocatedAmount).toBe(100);
    expect(refreshedPayment.unallocatedAmount).toBe(0);
    expect(refreshedInvoice.amountPaid).toBe(100);
    expect(refreshedInvoice.amountDue).toBe(0);
    expect(refreshedInvoice.status).toBe('PAID');
  });

  test('overpayments remain visible as customer credit balance after partial allocation', async () => {
    const invoice = await createOpenInvoice(40);
    const payment = await ArPayment.create({
      paymentDate: new Date('2026-05-12T00:00:00.000Z'),
      amount: 100,
      currency: 'CHF',
      customerId: ids.customer,
      paymentReference: 'OVERPAY-1',
      source: 'MANUAL',
      allocatedAmount: 0,
      unallocatedAmount: 100,
      createdBy: ids.user,
    });

    await arReceivablesService.allocatePayment(
      payment._id,
      [{ invoiceId: invoice._id, amount: 40 }],
      ids.user,
    );

    const credit = await arReceivablesService.getCustomerCreditBalance(ids.customer);
    const refreshedPayment = await ArPayment.findById(payment._id).lean();

    expect(refreshedPayment.allocatedAmount).toBe(40);
    expect(refreshedPayment.unallocatedAmount).toBe(60);
    expect(credit.totalCredit).toBe(60);
    expect(credit.paymentCount).toBe(1);
    expect(credit.payments).toHaveLength(1);
    expect(String(credit.payments[0]._id)).toBe(String(payment._id));
  });

  test('write-off posts journal entry and invoice update atomically with configured accounts', async () => {
    const { receivable, writeOffExpense } = await createRequiredMappings();
    const invoice = await createOpenInvoice(80);

    await arReceivablesService.writeOff(invoice._id, 'Unrecoverable', ids.user);

    const refreshedInvoice = await Invoice.findById(invoice._id).lean();
    const journal = await JournalEntry.findOne({ referenceType: 'WRITE_OFF', referenceId: invoice._id }).lean();

    expect(refreshedInvoice.status).toBe('WRITTEN_OFF');
    expect(refreshedInvoice.amountDue).toBe(0);
    expect(String(journal.debitAccountId)).toBe(String(writeOffExpense._id));
    expect(String(journal.creditAccountId)).toBe(String(receivable._id));
    expect(journal.amount).toBe(80);
  });

  test('manual reconciliation posts payment, allocation, bank match, invoice update, and mapped journal atomically', async () => {
    const { bankClearing, receivable } = await createRequiredMappings();
    const invoice = await createOpenInvoice(70);
    const transaction = await BankTransaction.create({
      bankAccountId: ids.bankAccount,
      transactionDate: new Date('2026-05-12T00:00:00.000Z'),
      valueDate: new Date('2026-05-12T00:00:00.000Z'),
      amount: 70,
      currency: 'CHF',
      reference: invoice.invoiceNumber,
      reconciliationStatus: 'UNMATCHED',
    });

    await reconciliationService.manualMatch(transaction._id, invoice._id, ids.user);

    const refreshedInvoice = await Invoice.findById(invoice._id).lean();
    const refreshedTransaction = await BankTransaction.findById(transaction._id).lean();
    const payment = await ArPayment.findOne({ bankTransactionId: transaction._id }).lean();
    const allocation = await ArPaymentAllocation.findOne({ paymentId: payment._id }).lean();
    const journal = await JournalEntry.findOne({ referenceType: 'MANUAL_RECONCILIATION', referenceId: transaction._id }).lean();

    expect(refreshedInvoice.status).toBe('PAID');
    expect(refreshedInvoice.amountDue).toBe(0);
    expect(refreshedTransaction.reconciliationStatus).toBe('MANUALLY_MATCHED');
    expect(String(allocation.invoiceId)).toBe(String(invoice._id));
    expect(String(journal.debitAccountId)).toBe(String(bankClearing._id));
    expect(String(journal.creditAccountId)).toBe(String(receivable._id));
  });

  test('racing AP payment-batch creation reserves approved invoices exactly once', async () => {
    const invoice = await ApInvoice.create({
      apInvoiceNumber: 'APR-2026-00001',
      supplierId: ids.supplier,
      supplierName: 'Supplier AG',
      supplierInvoiceNumber: 'SUP-1',
      invoiceDate: new Date('2026-05-01T00:00:00.000Z'),
      dueDate: new Date('2026-05-31T00:00:00.000Z'),
      lineItems: [{ description: 'Material', quantity: 1, unitPrice: 120, vatRate: 0 }],
      subtotal: 120,
      totalAmount: 120,
      outstandingAmount: 120,
      status: 'APPROVED',
      approvedBy: ids.user,
      approvedAt: new Date(),
      createdBy: ids.user,
    });

    const results = await Promise.allSettled([
      apInvoiceService.createPaymentBatch([invoice._id], ids.bankAccount, ids.user),
      apInvoiceService.createPaymentBatch([invoice._id], ids.bankAccount, ids.user),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    const refreshedInvoice = await ApInvoice.findById(invoice._id).lean();

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ statusCode: 409 });
    expect(await PaymentBatch.countDocuments()).toBe(1);
    expect(refreshedInvoice.paymentBatchId).toBeTruthy();
  });

  test('manual AP reconciliation clears payable and posts mapped journal entry', async () => {
    const { bankClearing, apPayable } = await createRequiredMappings();
    const invoice = await ApInvoice.create({
      apInvoiceNumber: 'APR-2026-10001',
      supplierId: ids.supplier,
      supplierName: 'Supplier AG',
      supplierInvoiceNumber: 'SUP-AP-1',
      invoiceDate: new Date('2026-05-01T00:00:00.000Z'),
      dueDate: new Date('2026-05-31T00:00:00.000Z'),
      lineItems: [{ description: 'Material', quantity: 1, unitPrice: 90, vatRate: 0 }],
      subtotal: 90,
      totalAmount: 90,
      paidAmount: 10,
      outstandingAmount: 80,
      status: 'APPROVED',
      approvedBy: ids.user,
      approvedAt: new Date(),
      createdBy: ids.user,
    });
    const transaction = await BankTransaction.create({
      bankAccountId: ids.bankAccount,
      transactionDate: new Date('2026-05-12T00:00:00.000Z'),
      valueDate: new Date('2026-05-12T00:00:00.000Z'),
      amount: -80,
      currency: 'CHF',
      reference: invoice.supplierInvoiceNumber,
      reconciliationStatus: 'UNMATCHED',
    });

    await reconciliationService.manualMatchAp(transaction._id, invoice._id, ids.user);

    const refreshedInvoice = await ApInvoice.findById(invoice._id).lean();
    const refreshedTransaction = await BankTransaction.findById(transaction._id).lean();
    const journal = await JournalEntry.findOne({ referenceType: 'AP_PAYMENT', referenceId: transaction._id }).lean();

    expect(refreshedInvoice.status).toBe('PAID');
    expect(refreshedInvoice.paidAmount).toBe(90);
    expect(refreshedInvoice.outstandingAmount).toBe(0);
    expect(refreshedTransaction.reconciliationStatus).toBe('MANUALLY_MATCHED');
    expect(String(journal.debitAccountId)).toBe(String(apPayable._id));
    expect(String(journal.creditAccountId)).toBe(String(bankClearing._id));
    expect(journal.amount).toBe(80);
  });

  test('open-item netting clears selected AR and AP balances with mapped journal entry', async () => {
    const { receivable, apPayable } = await createRequiredMappings();
    const arInvoice = await createOpenInvoice(60);
    const apInvoice = await ApInvoice.create({
      apInvoiceNumber: 'APR-2026-20001',
      supplierId: ids.customer,
      supplierName: 'Dual Role AG',
      supplierInvoiceNumber: 'SUP-NET-1',
      invoiceDate: new Date('2026-05-01T00:00:00.000Z'),
      dueDate: new Date('2026-05-31T00:00:00.000Z'),
      lineItems: [{ description: 'Supplier credit', quantity: 1, unitPrice: 40, vatRate: 0 }],
      subtotal: 40,
      totalAmount: 40,
      paidAmount: 0,
      outstandingAmount: 40,
      status: 'APPROVED',
      approvedBy: ids.user,
      approvedAt: new Date(),
      createdBy: ids.user,
    });

    const result = await openItemsService.netItems({
      customerId: ids.customer,
      supplierId: ids.customer,
      arInvoiceIds: [arInvoice._id],
      apInvoiceIds: [apInvoice._id],
      amount: 40,
      reason: 'Mutual offset',
    }, ids.user);

    const refreshedAr = await Invoice.findById(arInvoice._id).lean();
    const refreshedAp = await ApInvoice.findById(apInvoice._id).lean();
    const journal = await JournalEntry.findOne({ referenceType: 'NETTING' }).lean();

    expect(result.amount).toBe(40);
    expect(refreshedAr.amountPaid).toBe(40);
    expect(refreshedAr.amountDue).toBe(20);
    expect(refreshedAr.status).toBe('PARTIALLY_PAID');
    expect(refreshedAp.paidAmount).toBe(40);
    expect(refreshedAp.outstandingAmount).toBe(0);
    expect(refreshedAp.status).toBe('PAID');
    expect(String(journal.debitAccountId)).toBe(String(apPayable._id));
    expect(String(journal.creditAccountId)).toBe(String(receivable._id));
    expect(journal.amount).toBe(40);
  });
});
