import { describe, expect, test } from '@jest/globals';
import JournalEntry from '../../src/modules/accounting/journalEntry.model.js';
import Invoice from '../../src/modules/qop/invoice.model.js';

describe('accounting model contracts', () => {
  test('journal accepts reference types used by accounting server services', () => {
    for (const referenceType of [
      'WRITE_OFF',
      'INVOICE_FINALIZED',
      'INVOICE_PAYMENT',
      'AUTO_RECONCILIATION',
      'MANUAL_RECONCILIATION',
      'CATEGORIZATION',
      'NETTING',
    ]) {
      const entry = new JournalEntry({
        entryNumber: 1,
        entryDate: new Date(),
        description: referenceType,
        debitAccountId: '507f1f77bcf86cd799439011',
        creditAccountId: '507f1f77bcf86cd799439012',
        amount: 1,
        referenceType,
        createdBy: '507f1f77bcf86cd799439013',
      });

      expect(entry.validateSync()).toBeUndefined();
    }
  });

  test('invoice model accepts written-off status and write-off metadata', () => {
    const invoice = new Invoice({
      invoiceNumber: 'RE-2026-00001',
      invoiceType: 'STANDARD',
      customerId: '507f1f77bcf86cd799439011',
      customerName: 'Customer AG',
      lineItems: [{
        position: 1,
        description: 'Service',
        quantity: 1,
        unitPrice: 100,
        vatRate: 8.1,
      }],
      dueDate: new Date(),
      status: 'WRITTEN_OFF',
      writtenOffAt: new Date(),
      writeOffReason: 'Unrecoverable',
      createdBy: '507f1f77bcf86cd799439013',
    });

    expect(invoice.validateSync()).toBeUndefined();
  });
});
