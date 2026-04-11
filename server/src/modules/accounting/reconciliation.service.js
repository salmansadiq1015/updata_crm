import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

class ReconciliationService {
  /**
   * Run automatic reconciliation for a bank account.
   * Matches unmatched credit transactions against QOP invoices.
   */
  async runAutoReconciliation(bankAccountId) {
    const bankTransactionRepository = (await import('./bankTransaction.repository.js')).default;

    const unmatched = await bankTransactionRepository.findUnmatched(bankAccountId);

    let matchedCount = 0;
    let unmatchedCount = 0;

    for (const txn of unmatched) {
      // Only attempt to match credit (incoming) transactions
      if (txn.amount <= 0) {
        unmatchedCount++;
        continue;
      }

      let matchedInvoice = null;

      try {
        const Invoice = (await import('../qop/invoice.model.js')).default;

        // Strategy 1: Exact match by reference number
        if (txn.reference) {
          matchedInvoice = await Invoice.findOne({
            invoiceNumber: txn.reference,
            status: { $in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
          }).lean();
        }

        // Strategy 2: Amount + customer name match
        if (!matchedInvoice) {
          const candidates = await Invoice.find({
            status: { $in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
            $or: [
              { amountDue: txn.amount },
              { totalGross: txn.amount },
            ],
          }).populate('customerId', 'name companyName').lean();

          if (candidates.length === 1) {
            matchedInvoice = candidates[0];
          } else if (candidates.length > 1 && txn.payerPayeeName) {
            const payerLower = txn.payerPayeeName.toLowerCase();
            matchedInvoice = candidates.find((c) => {
              const custName = (c.customerId?.companyName || c.customerId?.name || '').toLowerCase();
              return custName && payerLower.includes(custName);
            }) || null;
          }
        }
      } catch {
        logger.warn('QOP Invoice model not available for reconciliation', {
          module: 'accounting',
          action: 'reconciliation.auto',
        });
      }

      if (matchedInvoice) {
        try {
          // Create AR payment
          const { arPaymentRepository, arPaymentAllocationRepository } = await import('./arPayment.repository.js');

          const payment = await arPaymentRepository.create({
            paymentDate: txn.transactionDate || txn.valueDate,
            amount: txn.amount,
            customerId: matchedInvoice.customerId?._id || matchedInvoice.customerId,
            paymentReference: txn.reference,
            bankAccountId,
            source: 'BANK_IMPORT',
            unallocatedAmount: 0,
            allocatedAmount: txn.amount,
            createdBy: null, // system
          });

          // Allocate to invoice
          await arPaymentAllocationRepository.create({
            paymentId: payment._id,
            invoiceId: matchedInvoice._id,
            amount: txn.amount,
            allocatedBy: null, // system
          });

          // Update invoice payment status
          try {
            const Invoice = (await import('../qop/invoice.model.js')).default;
            const newAmountPaid = (matchedInvoice.amountPaid || 0) + txn.amount;
            const newAmountDue = (matchedInvoice.totalGross || matchedInvoice.totalAmount || 0) - newAmountPaid;
            const updateData = { amountPaid: newAmountPaid, amountDue: newAmountDue };
            if (newAmountDue <= 0) updateData.status = 'PAID';
            else if (newAmountPaid > 0) updateData.status = 'PARTIALLY_PAID';
            await Invoice.findByIdAndUpdate(matchedInvoice._id, { $set: updateData });
          } catch {
            // Continue even if invoice update fails
          }

          // Update bank transaction reconciliation status
          await bankTransactionRepository.updateReconciliation(txn._id, 'AUTO_MATCHED', {
            matchedInvoiceId: matchedInvoice._id,
          });

          // Create journal entry (debit Bank, credit AR)
          try {
            const journalEntryService = (await import('./journalEntry.service.js')).default;
            await journalEntryService.createFromEvent(
              'AUTO_RECONCILIATION',
              txn._id,
              bankAccountId,
              matchedInvoice.customerId?._id || matchedInvoice.customerId,
              txn.amount,
              `Auto-reconciled: ${txn.reference || txn._id}`,
              null, // system
            );
          } catch (err) {
            logger.warn('Failed to create journal entry for auto-reconciliation', {
              module: 'accounting',
              transactionId: txn._id,
              error: { message: err.message },
            });
          }

          matchedCount++;
        } catch (err) {
          logger.warn('Failed to process auto-reconciliation match', {
            module: 'accounting',
            transactionId: txn._id,
            error: { message: err.message },
          });
          unmatchedCount++;
        }
      } else {
        unmatchedCount++;
      }
    }

    eventBus.publish(EVENT_TYPES.ACCOUNTING_RECONCILIATION_COMPLETED, {
      bankAccountId,
      matchedCount,
      unmatchedCount,
    }, { source: 'accounting:reconciliation' });

    logger.info('Auto-reconciliation completed', {
      module: 'accounting',
      action: 'reconciliation.auto',
      bankAccountId,
      matchedCount,
      unmatchedCount,
    });

    return { matchedCount, unmatchedCount };
  }

  /**
   * Get unmatched bank transactions with cursor pagination.
   */
  async getUnmatched(params) {
    const bankTransactionRepository = (await import('./bankTransaction.repository.js')).default;

    const { cursor, limit, sortBy, sortOrder, bankAccountId } = params;
    const filters = { reconciliationStatus: 'UNMATCHED' };
    if (bankAccountId) filters.bankAccountId = bankAccountId;

    return bankTransactionRepository.findWithCursor({
      cursor,
      limit,
      sortBy,
      sortOrder,
      filters,
    });
  }

  /**
   * Get match suggestions for a specific transaction.
   * Returns ranked candidate invoices.
   */
  async getSuggestions(transactionId) {
    const bankTransactionRepository = (await import('./bankTransaction.repository.js')).default;
    const txn = await bankTransactionRepository.findById(transactionId);
    if (!txn) throw new NotFoundError('BankTransaction', transactionId);

    const suggestions = [];

    try {
      const Invoice = (await import('../qop/invoice.model.js')).default;

      // Find candidate invoices by amount proximity
      const amountRange = txn.amount * 0.1; // 10% tolerance
      const candidates = await Invoice.find({
        status: { $in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
        $or: [
          { amountDue: { $gte: txn.amount - amountRange, $lte: txn.amount + amountRange } },
          { totalGross: { $gte: txn.amount - amountRange, $lte: txn.amount + amountRange } },
        ],
      }).populate('customerId', 'name companyName').lean();

      for (const candidate of candidates) {
        let score = 0;
        const reasons = [];

        // Exact amount match
        const candidateAmount = candidate.amountDue || candidate.totalGross || 0;
        if (candidateAmount === txn.amount) {
          score += 50;
          reasons.push('Exact amount match');
        } else {
          const diff = Math.abs(candidateAmount - txn.amount);
          const pct = diff / txn.amount;
          score += Math.max(0, 30 - Math.round(pct * 100));
          reasons.push(`Amount within ${Math.round(pct * 100)}%`);
        }

        // Reference match
        if (txn.reference && candidate.invoiceNumber) {
          if (txn.reference === candidate.invoiceNumber) {
            score += 40;
            reasons.push('Exact reference match');
          } else if (txn.reference.includes(candidate.invoiceNumber) || candidate.invoiceNumber.includes(txn.reference)) {
            score += 20;
            reasons.push('Partial reference match');
          }
        }

        // Customer name fuzzy match
        if (txn.payerPayeeName) {
          const payerLower = txn.payerPayeeName.toLowerCase();
          const custName = (candidate.customerId?.companyName || candidate.customerId?.name || '').toLowerCase();
          if (custName && payerLower.includes(custName)) {
            score += 10;
            reasons.push('Customer name match');
          }
        }

        suggestions.push({
          invoiceId: candidate._id,
          invoiceNumber: candidate.invoiceNumber,
          customerId: candidate.customerId?._id || candidate.customerId,
          customerName: candidate.customerId?.companyName || candidate.customerId?.name,
          invoiceAmount: candidateAmount,
          transactionAmount: txn.amount,
          score,
          reasons,
        });
      }

      // Sort by score descending
      suggestions.sort((a, b) => b.score - a.score);
    } catch {
      logger.warn('QOP Invoice model not available for suggestions', {
        module: 'accounting',
        action: 'reconciliation.suggestions',
      });
    }

    return suggestions;
  }

  /**
   * Manually match a bank transaction to an invoice.
   */
  async manualMatch(transactionId, invoiceId, userId, meta = {}) {
    const bankTransactionRepository = (await import('./bankTransaction.repository.js')).default;

    const txn = await bankTransactionRepository.findById(transactionId);
    if (!txn) throw new NotFoundError('BankTransaction', transactionId);

    if (txn.reconciliationStatus !== 'UNMATCHED') {
      throw new ConflictError('Transaction is already matched or categorized');
    }

    // Create AR payment
    const { arPaymentRepository, arPaymentAllocationRepository } = await import('./arPayment.repository.js');

    const payment = await arPaymentRepository.create({
      paymentDate: txn.transactionDate || txn.valueDate,
      amount: txn.amount,
      paymentReference: txn.reference,
      bankAccountId: txn.bankAccountId,
      source: 'BANK_IMPORT',
      unallocatedAmount: 0,
      allocatedAmount: txn.amount,
      createdBy: userId,
    });

    // Allocate to invoice
    await arPaymentAllocationRepository.create({
      paymentId: payment._id,
      invoiceId,
      amount: txn.amount,
      allocatedBy: userId,
    });

    // Update invoice payment status
    try {
      const Invoice = (await import('../qop/invoice.model.js')).default;
      const invoice = await Invoice.findById(invoiceId).lean();
      if (invoice) {
        const newAmountPaid = (invoice.amountPaid || 0) + txn.amount;
        const newAmountDue = (invoice.totalGross || invoice.totalAmount || 0) - newAmountPaid;
        const updateData = { amountPaid: newAmountPaid, amountDue: newAmountDue };
        if (newAmountDue <= 0) updateData.status = 'PAID';
        else if (newAmountPaid > 0) updateData.status = 'PARTIALLY_PAID';
        await Invoice.findByIdAndUpdate(invoiceId, { $set: updateData });
      }
    } catch {
      logger.warn('Could not update QOP invoice for manual match', { invoiceId });
    }

    // Update bank transaction
    await bankTransactionRepository.updateReconciliation(transactionId, 'MANUALLY_MATCHED', {
      matchedInvoiceId: invoiceId,
    });

    // Create journal entry
    try {
      const journalEntryService = (await import('./journalEntry.service.js')).default;
      await journalEntryService.createFromEvent(
        'MANUAL_RECONCILIATION',
        transactionId,
        txn.bankAccountId,
        invoiceId,
        txn.amount,
        `Manual reconciliation: ${txn.reference || transactionId}`,
        userId,
      );
    } catch (err) {
      logger.warn('Failed to create journal entry for manual match', {
        module: 'accounting',
        transactionId,
        error: { message: err.message },
      });
    }

    auditService.logEvent({
      eventType: 'accounting.reconciliation.manual_match',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { transactionId, invoiceId },
      module: 'accounting',
    });

    logger.info('Manual reconciliation match', {
      module: 'accounting',
      action: 'reconciliation.manual_match',
      transactionId,
      invoiceId,
    });

    return { transactionId, invoiceId, status: 'MANUALLY_MATCHED' };
  }

  /**
   * Categorize a non-invoice transaction (fees, interest, etc.).
   */
  async categorize(transactionId, accountId, userId, meta = {}) {
    const bankTransactionRepository = (await import('./bankTransaction.repository.js')).default;

    const txn = await bankTransactionRepository.findById(transactionId);
    if (!txn) throw new NotFoundError('BankTransaction', transactionId);

    if (txn.reconciliationStatus !== 'UNMATCHED') {
      throw new ConflictError('Transaction is already matched or categorized');
    }

    // Update bank transaction
    await bankTransactionRepository.updateReconciliation(transactionId, 'CATEGORIZED', {
      matchedAccountId: accountId,
    });

    // Create journal entry for the categorized transaction
    try {
      const journalEntryService = (await import('./journalEntry.service.js')).default;
      const debitAcct = txn.amount >= 0 ? txn.bankAccountId : accountId;
      const creditAcct = txn.amount >= 0 ? accountId : txn.bankAccountId;

      await journalEntryService.createFromEvent(
        'CATEGORIZATION',
        transactionId,
        debitAcct,
        creditAcct,
        Math.abs(txn.amount),
        `Categorized: ${txn.bookingText || txn.reference || transactionId}`,
        userId,
      );
    } catch (err) {
      logger.warn('Failed to create journal entry for categorization', {
        module: 'accounting',
        transactionId,
        error: { message: err.message },
      });
    }

    auditService.logEvent({
      eventType: 'accounting.reconciliation.categorized',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { transactionId, accountId },
      module: 'accounting',
    });

    logger.info('Transaction categorized', {
      module: 'accounting',
      action: 'reconciliation.categorize',
      transactionId,
      accountId,
    });

    return { transactionId, accountId, status: 'CATEGORIZED' };
  }
}

const reconciliationService = new ReconciliationService();
export default reconciliationService;
