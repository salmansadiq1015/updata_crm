import Account from './account.model.js';
import AccountingDocument from './accountingDocument.model.js';
import ApInvoice from './apInvoice.model.js';
import BankTransaction from './bankTransaction.model.js';
import JournalEntry from './journalEntry.model.js';
import Invoice from '../qop/invoice.model.js';

const SEARCH_TYPES = {
  ALL: 'ALL',
  ACCOUNT: 'ACCOUNT',
  JOURNAL_ENTRY: 'JOURNAL_ENTRY',
  AR_INVOICE: 'AR_INVOICE',
  AP_INVOICE: 'AP_INVOICE',
  BANK_TRANSACTION: 'BANK_TRANSACTION',
  DOCUMENT: 'DOCUMENT',
};

const SEARCH_SOURCES = [
  SEARCH_TYPES.ACCOUNT,
  SEARCH_TYPES.JOURNAL_ENTRY,
  SEARCH_TYPES.AR_INVOICE,
  SEARCH_TYPES.AP_INVOICE,
  SEARCH_TYPES.BANK_TRANSACTION,
  SEARCH_TYPES.DOCUMENT,
];

const DEFAULT_CURRENCY = 'CHF';
const DEFAULT_LIMIT = 25;
const MAX_SOURCE_LIMIT = 50;

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function numberOrNull(value) {
  if (value === '' || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function objectIdString(value) {
  return value == null ? null : String(value);
}

function dateRangeClause(fields, query) {
  if (!query.startDate && !query.endDate) return null;
  const range = {};
  if (query.startDate) range.$gte = new Date(query.startDate);
  if (query.endDate) range.$lte = new Date(query.endDate);
  const clauses = fields.map((field) => ({ [field]: range }));
  return clauses.length === 1 ? clauses[0] : { $or: clauses };
}

function amountRangeClause(fields, query, { absolute = false } = {}) {
  const minAmount = numberOrNull(query.minAmount);
  const maxAmount = numberOrNull(query.maxAmount);
  if (minAmount == null && maxAmount == null) return null;

  if (absolute) {
    const exprClauses = [];
    if (minAmount != null) exprClauses.push({ $gte: [{ $abs: `$${fields[0]}` }, minAmount] });
    if (maxAmount != null) exprClauses.push({ $lte: [{ $abs: `$${fields[0]}` }, maxAmount] });
    return { $expr: exprClauses.length === 1 ? exprClauses[0] : { $and: exprClauses } };
  }

  const range = {};
  if (minAmount != null) range.$gte = minAmount;
  if (maxAmount != null) range.$lte = maxAmount;
  const clauses = fields.map((field) => ({ [field]: range }));
  return clauses.length === 1 ? clauses[0] : { $or: clauses };
}

function appendAnd(filter, ...clauses) {
  const active = clauses.filter(Boolean);
  if (!active.length) return filter;
  return {
    ...filter,
    $and: [...(filter.$and || []), ...active],
  };
}

function appendSearchOr(filter, fields, q, numericFields = []) {
  if (!q) return filter;
  const regex = new RegExp(escapeRegExp(q), 'i');
  const numeric = numberOrNull(q);
  const clauses = fields.map((field) => ({ [field]: regex }));

  if (numeric != null) {
    numericFields.forEach((field) => clauses.push({ [field]: numeric }));
  }

  return appendAnd(filter, { $or: clauses });
}

function limitFor(query) {
  return Math.min(Math.max(Number(query.limit) || DEFAULT_LIMIT, 1), 100);
}

function sourceLimit(query) {
  return Math.min(Math.max(limitFor(query), 10), MAX_SOURCE_LIMIT);
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function resultTime(result) {
  const date = normalizeDate(result.date);
  return date ? date.getTime() : 0;
}

function trimText(value, fallback = '') {
  return String(value || fallback).trim();
}

function highlights(...values) {
  return values.filter((value) => value != null && String(value).trim() !== '').map((value) => String(value));
}

class AccountingSearchService {
  async search(query = {}) {
    const startedAt = Date.now();
    const selectedSources = query.type && query.type !== SEARCH_TYPES.ALL
      ? [query.type]
      : SEARCH_SOURCES;
    const perSourceLimit = sourceLimit(query);

    const sourceHandlers = {
      [SEARCH_TYPES.ACCOUNT]: () => this._searchAccounts(query, perSourceLimit),
      [SEARCH_TYPES.JOURNAL_ENTRY]: () => this._searchJournalEntries(query, perSourceLimit),
      [SEARCH_TYPES.AR_INVOICE]: () => this._searchArInvoices(query, perSourceLimit),
      [SEARCH_TYPES.AP_INVOICE]: () => this._searchApInvoices(query, perSourceLimit),
      [SEARCH_TYPES.BANK_TRANSACTION]: () => this._searchBankTransactions(query, perSourceLimit),
      [SEARCH_TYPES.DOCUMENT]: () => this._searchDocuments(query, perSourceLimit),
    };

    const settled = await Promise.all(
      selectedSources
        .filter((source) => sourceHandlers[source])
        .map(async (source) => {
          const data = await sourceHandlers[source]();
          return { source, data };
        }),
    );

    const flattened = settled
      .flatMap((entry) => entry.data)
      .sort((a, b) => resultTime(b) - resultTime(a))
      .slice(0, limitFor(query));

    const sourceCounts = settled.reduce((acc, entry) => {
      acc[entry.source] = entry.data.length;
      return acc;
    }, {});

    return {
      data: flattened,
      meta: {
        query: query.q || '',
        type: query.type || SEARCH_TYPES.ALL,
        limit: limitFor(query),
        returned: flattened.length,
        sourceCounts,
        durationMs: Date.now() - startedAt,
      },
    };
  }

  async _searchAccounts(query, limit) {
    let filter = {};
    filter = appendSearchOr(filter, ['accountNumber', 'name', 'description', 'type'], query.q);

    if (query.status === 'ACTIVE') filter.isActive = true;
    if (query.status === 'INACTIVE') filter.isActive = false;
    if (query.accountId) {
      filter = appendAnd(filter, {
        $or: [
          { _id: query.accountId },
          { parentId: query.accountId },
        ],
      });
    }

    filter = appendAnd(filter, dateRangeClause(['createdAt'], query));

    const accounts = await Account.find(filter)
      .sort({ accountNumber: 1, _id: 1 })
      .limit(limit)
      .select('_id accountNumber name type isGroup isActive description createdAt')
      .lean();

    return accounts.map((account) => ({
      id: objectIdString(account._id),
      type: SEARCH_TYPES.ACCOUNT,
      title: `${account.accountNumber} ${account.name}`,
      reference: account.accountNumber,
      status: account.isActive ? 'ACTIVE' : 'INACTIVE',
      amount: null,
      currency: query.currency || DEFAULT_CURRENCY,
      date: account.createdAt || null,
      partyName: null,
      href: `/accounting/chart-of-accounts?accountId=${account._id}`,
      highlights: highlights(account.type, account.isGroup ? 'Group account' : 'Posting account', account.description),
    }));
  }

  async _searchJournalEntries(query, limit) {
    let filter = {};
    filter = appendSearchOr(filter, ['description', 'referenceType'], query.q, ['entryNumber', 'amount']);
    filter = appendAnd(
      filter,
      dateRangeClause(['entryDate'], query),
      amountRangeClause(['amount'], query),
    );

    if (query.currency) filter.currency = query.currency;
    if (query.status) filter.referenceType = query.status;
    if (query.accountId) {
      filter = appendAnd(filter, {
        $or: [
          { debitAccountId: query.accountId },
          { creditAccountId: query.accountId },
        ],
      });
    }

    const entries = await JournalEntry.find(filter)
      .sort({ entryDate: -1, entryNumber: -1, _id: -1 })
      .limit(limit)
      .populate([
        { path: 'debitAccountId', select: 'accountNumber name' },
        { path: 'creditAccountId', select: 'accountNumber name' },
      ])
      .select('_id entryNumber entryDate description debitAccountId creditAccountId amount currency referenceType referenceId')
      .lean();

    return entries.map((entry) => ({
      id: objectIdString(entry._id),
      type: SEARCH_TYPES.JOURNAL_ENTRY,
      title: entry.description,
      reference: entry.entryNumber ? `JE-${entry.entryNumber}` : entry.referenceType,
      status: entry.referenceType,
      amount: entry.amount,
      currency: entry.currency || DEFAULT_CURRENCY,
      date: entry.entryDate,
      partyName: null,
      href: `/accounting/journal?entryId=${entry._id}`,
      highlights: highlights(
        entry.debitAccountId && `${entry.debitAccountId.accountNumber} ${entry.debitAccountId.name}`,
        entry.creditAccountId && `${entry.creditAccountId.accountNumber} ${entry.creditAccountId.name}`,
        entry.referenceType,
      ),
    }));
  }

  async _searchArInvoices(query, limit) {
    let filter = {};
    filter = appendSearchOr(
      filter,
      ['invoiceNumber', 'title', 'customerName', 'qrBillReference', 'paymentTermsText'],
      query.q,
      ['grandTotalRounded', 'amountDue'],
    );
    filter = appendAnd(
      filter,
      dateRangeClause(['invoiceDate', 'dueDate', 'createdAt'], query),
      amountRangeClause(['grandTotalRounded', 'amountDue'], query),
    );

    if (query.currency) filter.currency = query.currency;
    if (query.status) filter.status = query.status;

    const invoices = await Invoice.find(filter)
      .sort({ invoiceDate: -1, createdAt: -1, _id: -1 })
      .limit(limit)
      .select('_id invoiceNumber title customerName status grandTotalRounded amountDue currency invoiceDate dueDate')
      .lean();

    return invoices.map((invoice) => ({
      id: objectIdString(invoice._id),
      type: SEARCH_TYPES.AR_INVOICE,
      title: trimText(invoice.title, invoice.invoiceNumber),
      reference: invoice.invoiceNumber,
      status: invoice.status,
      amount: invoice.amountDue ?? invoice.grandTotalRounded ?? 0,
      currency: invoice.currency || DEFAULT_CURRENCY,
      date: invoice.invoiceDate || invoice.dueDate || null,
      partyName: invoice.customerName || null,
      href: `/accounting/receivables?invoiceId=${invoice._id}`,
      highlights: highlights(invoice.customerName, invoice.dueDate && `Due ${new Date(invoice.dueDate).toISOString().slice(0, 10)}`),
    }));
  }

  async _searchApInvoices(query, limit) {
    let filter = {};
    filter = appendSearchOr(
      filter,
      ['apInvoiceNumber', 'supplierInvoiceNumber', 'supplierName', 'projectReference', 'orderReference'],
      query.q,
      ['totalAmount', 'outstandingAmount'],
    );
    filter = appendAnd(
      filter,
      dateRangeClause(['invoiceDate', 'dueDate', 'createdAt'], query),
      amountRangeClause(['totalAmount', 'outstandingAmount'], query),
    );

    if (query.currency) filter.currency = query.currency;
    if (query.status) filter.status = query.status;
    if (query.accountId) {
      filter = appendAnd(filter, {
        $or: [
          { 'lineItems.accountId': query.accountId },
          { 'lineItems.allocations.accountId': query.accountId },
        ],
      });
    }

    const invoices = await ApInvoice.find(filter)
      .sort({ invoiceDate: -1, createdAt: -1, _id: -1 })
      .limit(limit)
      .select('_id apInvoiceNumber supplierInvoiceNumber supplierName status totalAmount outstandingAmount currency invoiceDate dueDate projectReference orderReference')
      .lean();

    return invoices.map((invoice) => ({
      id: objectIdString(invoice._id),
      type: SEARCH_TYPES.AP_INVOICE,
      title: invoice.supplierInvoiceNumber || invoice.apInvoiceNumber,
      reference: invoice.apInvoiceNumber,
      status: invoice.status,
      amount: invoice.outstandingAmount ?? invoice.totalAmount ?? 0,
      currency: invoice.currency || DEFAULT_CURRENCY,
      date: invoice.invoiceDate || invoice.dueDate || null,
      partyName: invoice.supplierName || null,
      href: `/accounting/payables?invoiceId=${invoice._id}`,
      highlights: highlights(invoice.supplierInvoiceNumber, invoice.projectReference, invoice.orderReference),
    }));
  }

  async _searchBankTransactions(query, limit) {
    let filter = {};
    filter = appendSearchOr(
      filter,
      ['reference', 'payerPayeeName', 'payerPayeeIban', 'bookingText', 'statementId'],
      query.q,
      ['amount'],
    );
    filter = appendAnd(
      filter,
      dateRangeClause(['transactionDate', 'valueDate', 'createdAt'], query),
      amountRangeClause(['amount'], query, { absolute: true }),
    );

    if (query.currency) filter.currency = query.currency;
    if (query.status) filter.reconciliationStatus = query.status;
    if (query.accountId) filter.matchedAccountId = query.accountId;

    const transactions = await BankTransaction.find(filter)
      .sort({ transactionDate: -1, _id: -1 })
      .limit(limit)
      .select('_id transactionDate valueDate amount currency reference payerPayeeName bookingText statementId reconciliationStatus matchedAccountId')
      .lean();

    return transactions.map((transaction) => ({
      id: objectIdString(transaction._id),
      type: SEARCH_TYPES.BANK_TRANSACTION,
      title: trimText(transaction.bookingText, transaction.reference || transaction.payerPayeeName),
      reference: transaction.reference || transaction.statementId || null,
      status: transaction.reconciliationStatus,
      amount: transaction.amount,
      currency: transaction.currency || DEFAULT_CURRENCY,
      date: transaction.transactionDate || transaction.valueDate || null,
      partyName: transaction.payerPayeeName || null,
      href: `/accounting/bank?transactionId=${transaction._id}`,
      highlights: highlights(transaction.payerPayeeName, transaction.statementId),
    }));
  }

  async _searchDocuments(query, limit) {
    let filter = {};
    filter = appendSearchOr(
      filter,
      ['fileName', 'notes', 'projectReference', 'supplierName', 'accountingCategory', 'fullText'],
      query.q,
      ['amount', 'vat'],
    );
    filter = appendAnd(
      filter,
      dateRangeClause(['receiptDate', 'createdAt'], query),
      amountRangeClause(['amount'], query),
    );

    if (query.status) {
      filter = appendAnd(filter, {
        $or: [
          { processingStatus: query.status },
          { ocrStatus: query.status },
          { documentType: query.status },
        ],
      });
    }

    const documents = await AccountingDocument.find(filter)
      .sort({ receiptDate: -1, createdAt: -1, _id: -1 })
      .limit(limit)
      .select('_id fileName documentType ocrStatus processingStatus projectReference supplierName accountingCategory amount receiptDate createdAt')
      .lean();

    return documents.map((document) => ({
      id: objectIdString(document._id),
      type: SEARCH_TYPES.DOCUMENT,
      title: document.fileName,
      reference: document.documentType,
      status: document.processingStatus || document.ocrStatus,
      amount: document.amount,
      currency: query.currency || DEFAULT_CURRENCY,
      date: document.receiptDate || document.createdAt || null,
      partyName: document.supplierName || null,
      href: `/accounting/documents?documentId=${document._id}`,
      highlights: highlights(document.projectReference, document.accountingCategory, document.ocrStatus),
    }));
  }
}

const accountingSearchService = new AccountingSearchService();
export default accountingSearchService;
export { SEARCH_TYPES };
