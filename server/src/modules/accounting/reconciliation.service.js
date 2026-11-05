import { roundCurrency } from '../../shared/data/currencies.js';
import mongoose from 'mongoose';
import { matchBankCategoryRule } from './bankCategoryRules.js';
import accountMappingService, { ACCOUNT_MAPPING } from './accountMapping.service.js';
import reconciliationLearningRepository from './reconciliationLearning.repository.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';
import { AppError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import logger from '../../shared/logger/index.js';


class ReconciliationService {
  /**
   * Run automatic reconciliation for a bank account.
   * Matches unmatched credit transactions against QOP invoices.
   */
  async runAutoReconciliation(bankAccountId) {
    const bankTransactionRepository = (await import('./bankTransaction.repository.js')).default;

    const unmatched = await bankTransactionRepository.findUnmatched(bankAccountId);

    const bankAccountRepository = (await import('./bankAccount.repository.js')).default;
    const bankAccount = await bankAccountRepository.findById(bankAccountId);
    let categorizedCount = 0;
    let matchedCount = 0;
    let unmatchedCount = 0;

    for (const txn of unmatched) {
      if (txn.amount === 0) {
        unmatchedCount++;
        continue;
      }

      let matchedInvoice = null;
      let matchedApInvoice = null;

      if (txn.amount > 0) {
        try {
          const Invoice = (await import('../qop/invoice.model.js')).default;

          // Strategy 1: Exact match by reference number
          if (txn.reference) {
            matchedInvoice = await Invoice.findOne({
              invoiceNumber: txn.reference,
              isDeleted: false,
              currency: txn.currency,
              status: { $in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
              amountDue: { $gt: 0 },
            }).lean();
          }

          // Strategy 2: learned manual match pattern + exact open amount
          if (!matchedInvoice) {
            matchedInvoice = await this._findLearnedArMatch(txn);
          }

          // Strategy 3: Amount + customer name match
          if (!matchedInvoice) {
            const candidates = await Invoice.find({
              isDeleted: false,
              currency: txn.currency,
              status: { $in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
              amountDue: txn.amount,
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
      } else {
        try {
          const apInvoiceRepository = (await import('./apInvoice.repository.js')).default;
          matchedApInvoice = await this._findLearnedApMatch(txn);

          if (!matchedApInvoice) {
            matchedApInvoice = await apInvoiceRepository.findOpenForAutoMatch({
              currency: txn.currency,
              reference: txn.reference,
              amount: roundCurrency(Math.abs(txn.amount), txn.currency),
              payeeName: txn.payerPayeeName,
            });
          }
        } catch (err) {
          logger.warn('AP invoice repository not available for reconciliation', {
            module: 'accounting',
            action: 'reconciliation.auto',
            error: { message: err.message },
          });
        }
      }

      if (matchedInvoice) {
        try {
          await this._postIncomingArMatch({
            transactionId: txn._id,
            invoiceId: matchedInvoice._id,
            userId: null,
            matchStatus: 'AUTO_MATCHED',
            journalReferenceType: 'AUTO_RECONCILIATION',
            journalDescriptionPrefix: 'Auto-reconciled',
          });
          matchedCount++;
        } catch (err) {
          logger.warn('Failed to process auto-reconciliation match', {
            module: 'accounting',
            transactionId: txn._id,
            error: { message: err.message },
          });
          unmatchedCount++;
        }
      } else if (matchedApInvoice) {
        try {
          await this._postOutgoingApMatch({
            transactionId: txn._id,
            apInvoiceId: matchedApInvoice._id,
            userId: null,
            matchStatus: 'AUTO_MATCHED',
            journalReferenceType: 'AP_PAYMENT',
            journalDescriptionPrefix: 'Auto AP reconciliation',
          });
          matchedCount++;
        } catch (err) {
          logger.warn('Failed to process auto-reconciliation AP match', {
            module: 'accounting',
            transactionId: txn._id,
            error: { message: err.message },
          });
          unmatchedCount++;
        }
      } else {
        const accountId = matchBankCategoryRule(txn, bankAccount?.categoryRules);
        if (accountId) {
          try {
            await this.categorize(txn._id, accountId, null);
            categorizedCount++;
          } catch (err) {
            unmatchedCount++;
            logger.warn('Automatic categorization requires review', { transactionId: txn._id, error: { message: err.message } });
          }
        } else unmatchedCount++;
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

    return { matchedCount, unmatchedCount, ...(categorizedCount ? { categorizedCount } : {}) };
  }

  async _findLearnedArMatch(txn) {
    const learned = await reconciliationLearningRepository.findCandidate({
      direction: 'INCOMING',
      targetType: 'AR_INVOICE',
      partyName: txn.payerPayeeName,
      partyIban: txn.payerPayeeIban,
      currency: txn.currency,
    });
    if (!learned) return null;

    const Invoice = (await import('../qop/invoice.model.js')).default;
    const candidates = await Invoice.find({
      customerId: learned.entityId,
      isDeleted: false,
      status: { $in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
      amountDue: roundCurrency(txn.amount, txn.currency),
    })
      .sort({ dueDate: 1, _id: 1 })
      .limit(2)
      .lean();

    return candidates.length === 1 ? candidates[0] : null;
  }

  async _findLearnedApMatch(txn) {
    const learned = await reconciliationLearningRepository.findCandidate({
      direction: 'OUTGOING',
      targetType: 'AP_INVOICE',
      partyName: txn.payerPayeeName,
      partyIban: txn.payerPayeeIban,
      currency: txn.currency,
    });
    if (!learned) return null;

    const apInvoiceRepository = (await import('./apInvoice.repository.js')).default;
    return apInvoiceRepository.findSingleOpenBySupplierAndAmount({
      supplierId: learned.entityId,
      amount: roundCurrency(Math.abs(txn.amount), txn.currency),
      currency: txn.currency,
    });
  }

  async _recordLearningSafely(data) {
    try {
      await reconciliationLearningRepository.recordManualMatch(data);
    } catch (err) {
      logger.warn('Failed to record reconciliation learning pattern', {
        module: 'accounting',
        action: 'reconciliation.learning.record',
        error: { message: err.message },
      });
    }
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

  async getReport(params = {}) {
    const roundMoney = value => roundCurrency(value, params.currency);
    const bankTransactionRepository = (await import('./bankTransaction.repository.js')).default;
    const summary = await bankTransactionRepository.getReconciliationSummary(params);

    const byStatus = new Map(summary.map((row) => [row._id, row]));
    const readStatus = (status) => {
      const row = byStatus.get(status) || {};
      return {
        count: row.count || 0,
        total: roundMoney(row.total || 0),
        incomingTotal: roundMoney(row.incomingTotal || 0),
        outgoingTotal: roundMoney(row.outgoingTotal || 0),
      };
    };

    let partial = { count: 0, total: 0 };
    try {
      const matched = await bankTransactionRepository.findMatchedInvoiceTransactions(params);
      const incomingMatches = matched.filter((txn) => txn.amount > 0 && txn.matchedInvoiceId);
      if (incomingMatches.length > 0) {
        const Invoice = (await import('../qop/invoice.model.js')).default;
        const invoiceIds = incomingMatches.map((txn) => txn.matchedInvoiceId);
        const invoices = await Invoice.find({
          _id: { $in: invoiceIds },
          isDeleted: false,
          amountDue: { $gt: 0 },
        }).select('_id amountDue status').lean();
        const partialInvoiceIds = new Set(invoices.map((invoice) => String(invoice._id)));
        const partialTransactions = incomingMatches.filter((txn) => partialInvoiceIds.has(String(txn.matchedInvoiceId)));
        partial = {
          count: partialTransactions.length,
          total: roundMoney(partialTransactions.reduce((sum, txn) => sum + txn.amount, 0)),
        };
      }
    } catch (err) {
      logger.warn('Failed to enrich reconciliation report with partial payment data', {
        module: 'accounting',
        action: 'reconciliation.report',
        error: { message: err.message },
      });
    }

    const report = {
      bankAccountId: params.bankAccountId || null,
      generatedAt: new Date(),
      autoMatched: readStatus('AUTO_MATCHED'),
      manuallyMatched: readStatus('MANUALLY_MATCHED'),
      categorized: readStatus('CATEGORIZED'),
      unmatched: readStatus('UNMATCHED'),
      partiallyMatched: partial,
    };

    report.matched = {
      count: report.autoMatched.count + report.manuallyMatched.count,
      total: roundMoney(report.autoMatched.total + report.manuallyMatched.total),
    };

    return report;
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
        currency: txn.currency,
        isDeleted: false,
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

  async _postIncomingArMatch({
    transactionId,
    invoiceId,
    userId,
    matchStatus,
    journalReferenceType,
    journalDescriptionPrefix,
  }) {
    const bankTransactionRepository = (await import('./bankTransaction.repository.js')).default;
    const { arPaymentRepository, arPaymentAllocationRepository } = await import('./arPayment.repository.js');
    const journalEntryService = (await import('./journalEntry.service.js')).default;
    const Invoice = (await import('../qop/invoice.model.js')).default;
    const session = await mongoose.startSession();
    let txn;
    let invoice;
    let payment;

    try {
      await session.withTransaction(async () => {
        txn = await bankTransactionRepository.findById(transactionId, { session });
        if (!txn) throw new NotFoundError('BankTransaction', transactionId);

        if (txn.reconciliationStatus !== 'UNMATCHED') {
          throw new ConflictError('Transaction is already matched or categorized');
        }
        if (txn.amount <= 0) {
          throw new AppError(
            'Only incoming bank transactions can be matched to AR invoices',
            400,
            ERROR_CODES.ACCT_RECONCILIATION_ALREADY_MATCHED,
          );
        }

        invoice = await Invoice.findOne({
          _id: invoiceId,
          isDeleted: false,
          status: { $in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
          amountDue: { $gte: txn.amount },
        }).session(session).lean();
        if (!invoice) throw new NotFoundError('Invoice', invoiceId);

        if (invoice.currency && txn.currency && invoice.currency !== txn.currency) throw new ConflictError('Invoice and bank transaction currencies must match');

        payment = await arPaymentRepository.create({
          paymentDate: txn.transactionDate || txn.valueDate,
          amount: txn.amount,
          currency: txn.currency,
          customerId: invoice.customerId?._id || invoice.customerId,
          paymentReference: txn.reference,
          bankAccountId: txn.bankAccountId,
          bankTransactionId: txn._id,
          source: 'BANK_IMPORT',
          unallocatedAmount: 0,
          allocatedAmount: txn.amount,
          createdBy: userId,
        }, { session });

        await arPaymentAllocationRepository.create({
          paymentId: payment._id,
          invoiceId,
          amount: txn.amount,
          allocatedBy: userId,
        }, { session });

        const newAmountPaid = roundCurrency((invoice.amountPaid || 0) + txn.amount, txn.currency);
        const newAmountDue = roundCurrency((invoice.amountDue || 0) - txn.amount, txn.currency);
        const invoiceUpdate = await Invoice.updateOne(
          {
            _id: invoiceId,
            isDeleted: false,
            status: { $in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
            amountDue: { $gte: txn.amount },
          },
          {
            $set: {
              amountPaid: newAmountPaid,
              amountDue: newAmountDue,
              status: newAmountDue <= 0 ? 'PAID' : 'PARTIALLY_PAID',
              ...(newAmountDue <= 0 ? { paidAt: new Date() } : {}),
            },
          },
          { session },
        );
        if (invoiceUpdate.matchedCount !== 1) {
          throw new ConflictError('Invoice changed while reconciliation was being posted');
        }

        const transactionUpdate = await bankTransactionRepository.markReconciledIfUnmatched(
          transactionId,
          matchStatus,
          { matchedInvoiceId: invoiceId },
          { session },
        );
        if (transactionUpdate.matchedCount !== 1) {
          throw new ConflictError('Transaction is already matched or categorized');
        }

        // Sequential: both calls share the transaction's session, which only
        // allows one operation in flight at a time.
        const bankAccountId = await accountMappingService.resolveGlobal(ACCOUNT_MAPPING.BANK_CLEARING, { session });
        const receivableAccountId = await accountMappingService.resolveGlobal(ACCOUNT_MAPPING.AR_RECEIVABLE, { session });

        await journalEntryService.createFromEvent(
          journalReferenceType,
          transactionId,
          bankAccountId,
          receivableAccountId,
          txn.amount,
          `${journalDescriptionPrefix}: ${txn.reference || transactionId}`,
          userId,
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    return { transaction: txn, invoice, payment };
  }

  async _postOutgoingApMatch({
    transactionId,
    apInvoiceId,
    userId,
    matchStatus,
    journalReferenceType,
    journalDescriptionPrefix,
  }) {
    const bankTransactionRepository = (await import('./bankTransaction.repository.js')).default;
    const apInvoiceRepository = (await import('./apInvoice.repository.js')).default;
    const journalEntryService = (await import('./journalEntry.service.js')).default;
    const session = await mongoose.startSession();
    let txn;
    let invoice;
    let amount;

    try {
      await session.withTransaction(async () => {
        txn = await bankTransactionRepository.findById(transactionId, { session });
        if (!txn) throw new NotFoundError('BankTransaction', transactionId);

        if (txn.reconciliationStatus !== 'UNMATCHED') {
          throw new ConflictError('Transaction is already matched or categorized');
        }
        if (txn.amount >= 0) {
          throw new AppError(
            'Only outgoing bank transactions can be matched to AP invoices',
            400,
            ERROR_CODES.ACCT_RECONCILIATION_ALREADY_MATCHED,
          );
        }

        amount = roundCurrency(Math.abs(txn.amount), txn.currency);
        invoice = await apInvoiceRepository.findById(apInvoiceId, { session });
        if (!invoice) throw new NotFoundError('ApInvoice', apInvoiceId);
        if (!['RECORDED', 'APPROVED', 'PARTIALLY_PAID'].includes(invoice.status)) {
          throw new ConflictError(`AP invoice ${invoice.apInvoiceNumber} is not open for reconciliation`);
        }
        if (roundCurrency(invoice.outstandingAmount, txn.currency) < amount) {
          throw new ConflictError(`Payment exceeds outstanding amount for AP invoice ${invoice.apInvoiceNumber}`);
        }

        if (invoice.currency && txn.currency && invoice.currency !== txn.currency) throw new ConflictError('Invoice and bank transaction currencies must match');
        const invoiceUpdate = await apInvoiceRepository.applyPaymentDelta(apInvoiceId, amount, { session });
        if (invoiceUpdate.matchedCount !== 1) {
          throw new ConflictError('AP invoice changed while reconciliation was being posted');
        }

        const transactionUpdate = await bankTransactionRepository.markReconciledIfUnmatched(
          transactionId,
          matchStatus,
          { matchedInvoiceId: apInvoiceId },
          { session },
        );
        if (transactionUpdate.matchedCount !== 1) {
          throw new ConflictError('Transaction is already matched or categorized');
        }

        // Sequential: both calls share the transaction's session, which only
        // allows one operation in flight at a time.
        const payableAccountId = await accountMappingService.resolveGlobal(ACCOUNT_MAPPING.AP_PAYABLE, { session });
        const bankAccountId = await accountMappingService.resolveGlobal(ACCOUNT_MAPPING.BANK_CLEARING, { session });

        await journalEntryService.createFromEvent(
          journalReferenceType,
          transactionId,
          payableAccountId,
          bankAccountId,
          amount,
          `${journalDescriptionPrefix}: ${txn.reference || transactionId}`,
          userId,
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    return { transaction: txn, invoice, amount };
  }

  /**
   * Manually match a bank transaction to an invoice.
   */
  async manualMatch(transactionId, invoiceId, userId, meta = {}) {
    const result = await this._postIncomingArMatch({
      transactionId,
      invoiceId,
      userId,
      matchStatus: 'MANUALLY_MATCHED',
      journalReferenceType: 'MANUAL_RECONCILIATION',
      journalDescriptionPrefix: 'Manual reconciliation',
    });

    await this._recordLearningSafely({
      direction: 'INCOMING',
      targetType: 'AR_INVOICE',
      entityId: result.invoice.customerId?._id || result.invoice.customerId,
      partyName: result.transaction.payerPayeeName,
      partyIban: result.transaction.payerPayeeIban,
      currency: result.transaction.currency,
      transactionId,
      invoiceId,
      userId,
    });

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

  async manualMatchAp(transactionId, apInvoiceId, userId, meta = {}) {
    const result = await this._postOutgoingApMatch({
      transactionId,
      apInvoiceId,
      userId,
      matchStatus: 'MANUALLY_MATCHED',
      journalReferenceType: 'AP_PAYMENT',
      journalDescriptionPrefix: 'Manual AP reconciliation',
    });

    await this._recordLearningSafely({
      direction: 'OUTGOING',
      targetType: 'AP_INVOICE',
      entityId: result.invoice.supplierId?._id || result.invoice.supplierId,
      partyName: result.transaction.payerPayeeName,
      partyIban: result.transaction.payerPayeeIban,
      currency: result.transaction.currency,
      transactionId,
      invoiceId: apInvoiceId,
      userId,
    });

    auditService.logEvent({
      eventType: 'accounting.reconciliation.manual_match_ap',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { transactionId, apInvoiceId },
      module: 'accounting',
    });

    logger.info('Manual AP reconciliation match', {
      module: 'accounting',
      action: 'reconciliation.manual_match_ap',
      transactionId,
      apInvoiceId,
    });

    return { transactionId, apInvoiceId, status: 'MANUALLY_MATCHED' };
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

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const accountRepository = (await import('./account.repository.js')).default;
        const destination = await accountRepository.findById(accountId, { session });
        if (!destination || !destination.isActive) throw new NotFoundError('Active Account', accountId);
        if (!Number.isFinite(txn.amount) || txn.amount === 0) throw new AppError('Cannot categorize a zero or invalid amount', 400, ERROR_CODES.INVALID_INPUT);
        const claimed = await bankTransactionRepository.markReconciledIfUnmatched(transactionId, 'CATEGORIZED', { matchedAccountId: accountId }, { session });
        if (claimed.modifiedCount !== 1) throw new ConflictError('Transaction is already matched or categorized');
        const journalEntryService = (await import('./journalEntry.service.js')).default;
        const bankClearingAccountId = await accountMappingService.resolveGlobal(ACCOUNT_MAPPING.BANK_CLEARING);
        await journalEntryService.createFromEvent(
          'CATEGORIZATION', transactionId,
          txn.amount > 0 ? bankClearingAccountId : accountId,
          txn.amount > 0 ? accountId : bankClearingAccountId,
          Math.abs(txn.amount),
          `Categorized: ${txn.bookingText || txn.reference || transactionId}`,
          userId,
          { session, currency: txn.currency, entryDate: txn.transactionDate || txn.valueDate },
        );
      });
    } finally {
      await session.endSession();
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
