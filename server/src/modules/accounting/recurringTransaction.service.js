import recurringRepository from './recurringTransaction.repository.js';
import counterService from './accounting.counter.service.js';
import journalEntryService from './journalEntry.service.js';
import apInvoiceService from './apInvoice.service.js';
import invoiceService from '../qop/invoice.service.js';
import auditService from '../auth/audit.service.js';
import { AppError, NotFoundError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import logger from '../../shared/logger/index.js';

const EDITABLE_STATUSES = ['DRAFT', 'PAUSED'];
const ACTIVE_STATUSES = ['ACTIVE'];
const TYPE_ENTITY_MAP = {
  JOURNAL: 'JournalEntry',
  AP_BILL: 'ApInvoice',
  AR_INVOICE: 'Invoice',
};

function stripUndefined(payload = {}) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

function normalizeEnum(value) {
  return value ? String(value).trim().toUpperCase() : undefined;
}

function asDate(value) {
  return value instanceof Date ? new Date(value.getTime()) : new Date(value);
}

function dateOnlyKey(value) {
  return asDate(value).toISOString().slice(0, 10);
}

function addDays(value, days) {
  const date = asDate(value);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date;
}

function lastDayOfMonth(year, month) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function addMonths(value, months) {
  const date = asDate(value);
  const day = date.getUTCDate();
  const targetMonth = date.getUTCMonth() + months;
  const targetYear = date.getUTCFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const clampedDay = Math.min(day, lastDayOfMonth(targetYear, normalizedMonth));
  return new Date(Date.UTC(
    targetYear,
    normalizedMonth,
    clampedDay,
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds(),
  ));
}

function nextRunDate(currentRunDate, frequency, interval = 1) {
  const step = Number(interval || 1);
  switch (frequency) {
    case 'DAILY':
      return addDays(currentRunDate, step);
    case 'WEEKLY':
      return addDays(currentRunDate, step * 7);
    case 'MONTHLY':
      return addMonths(currentRunDate, step);
    case 'QUARTERLY':
      return addMonths(currentRunDate, step * 3);
    case 'YEARLY':
      return addMonths(currentRunDate, step * 12);
    default:
      throw new AppError(
        `Unsupported recurring frequency: ${frequency}`,
        400,
        ERROR_CODES.ACCT_RECURRING_PAYLOAD_INVALID,
      );
  }
}

function formatTemplateText(value, { runDate, periodKey, recurringNumber }) {
  return String(value || '')
    .replaceAll('{date}', dateOnlyKey(runDate))
    .replaceAll('{period}', periodKey)
    .replaceAll('{number}', recurringNumber);
}

function formatUniqueReference(value, context) {
  const raw = String(value || '');
  const formatted = formatTemplateText(raw, context);
  return raw.includes('{date}') || raw.includes('{period}') || raw.includes('{number}')
    ? formatted
    : `${formatted}-${context.periodKey}`;
}

function assertState(transaction, allowed, action) {
  if (!allowed.includes(transaction.status)) {
    throw new AppError(
      `Recurring transaction ${transaction.recurringNumber} cannot be ${action} while ${transaction.status.toLowerCase()}`,
      409,
      ERROR_CODES.ACCT_RECURRING_INVALID_STATE,
      [{ recurringTransactionId: transaction._id, status: transaction.status, action }],
    );
  }
}

function assertPositiveNumber(value, field) {
  if (!(Number(value) > 0)) {
    throw new AppError(
      `${field} must be greater than zero`,
      400,
      ERROR_CODES.ACCT_RECURRING_PAYLOAD_INVALID,
      [{ field }],
    );
  }
}

class RecurringTransactionService {
  async create(data, userId, meta = {}) {
    const transactionType = normalizeEnum(data.transactionType);
    const frequency = normalizeEnum(data.frequency);
    const templatePayload = this._validateTemplatePayload(transactionType, data.templatePayload);
    const recurringNumber = data.recurringNumber || await counterService.getNextRecurringTransactionNumber();
    const transaction = await recurringRepository.create({
      ...data,
      recurringNumber,
      transactionType,
      status: 'DRAFT',
      frequency,
      nextRunDate: data.nextRunDate || data.startDate,
      templatePayload,
      createdBy: userId,
    });

    auditService.logEvent({
      eventType: 'accounting.recurring.created',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { recurringTransactionId: transaction._id, recurringNumber },
      module: 'accounting',
    });

    return recurringRepository.findById(transaction._id);
  }

  async list(filters = {}) {
    return recurringRepository.findWithFilters({
      ...filters,
      status: normalizeEnum(filters.status),
      transactionType: normalizeEnum(filters.transactionType),
    });
  }

  async summary() {
    const summary = await recurringRepository.summarize();
    return {
      total: summary.total || 0,
      activeCount: summary.activeCount || 0,
      pausedCount: summary.pausedCount || 0,
      dueCount: summary.dueCount || 0,
    };
  }

  async getById(id) {
    const transaction = await recurringRepository.findById(id);
    if (!transaction) throw new NotFoundError('RecurringTransaction', id);
    return transaction;
  }

  async update(id, data, userId, meta = {}) {
    const transaction = await this.getById(id);
    assertState(transaction, EDITABLE_STATUSES, 'updated');

    const transactionType = normalizeEnum(data.transactionType || transaction.transactionType);
    const templatePayload = data.templatePayload
      ? this._validateTemplatePayload(transactionType, data.templatePayload)
      : undefined;

    const updated = await recurringRepository.updateById(id, stripUndefined({
      ...data,
      transactionType: data.transactionType ? transactionType : undefined,
      frequency: data.frequency ? normalizeEnum(data.frequency) : undefined,
      templatePayload,
      updatedBy: userId,
    }));

    auditService.logEvent({
      eventType: 'accounting.recurring.updated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { recurringTransactionId: id, changedFields: Object.keys(data) },
      module: 'accounting',
    });

    return updated;
  }

  async activate(id, userId, meta = {}) {
    const transaction = await this.getById(id);
    assertState(transaction, ['DRAFT', 'PAUSED'], 'activated');
    const updated = await recurringRepository.updateById(id, {
      status: 'ACTIVE',
      activatedAt: new Date(),
      activatedBy: userId,
      updatedBy: userId,
    });
    auditService.logEvent({
      eventType: 'accounting.recurring.activated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { recurringTransactionId: id },
      module: 'accounting',
    });
    return updated;
  }

  async pause(id, userId, meta = {}) {
    const transaction = await this.getById(id);
    assertState(transaction, ACTIVE_STATUSES, 'paused');
    const updated = await recurringRepository.updateById(id, {
      status: 'PAUSED',
      pausedAt: new Date(),
      pausedBy: userId,
      updatedBy: userId,
    });
    auditService.logEvent({
      eventType: 'accounting.recurring.paused',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { recurringTransactionId: id },
      module: 'accounting',
    });
    return updated;
  }

  async archive(id, userId, meta = {}) {
    const transaction = await this.getById(id);
    assertState(transaction, ['DRAFT', 'PAUSED', 'COMPLETED'], 'archived');
    const updated = await recurringRepository.updateById(id, {
      status: 'ARCHIVED',
      archivedAt: new Date(),
      archivedBy: userId,
      updatedBy: userId,
    });
    auditService.logEvent({
      eventType: 'accounting.recurring.archived',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { recurringTransactionId: id },
      module: 'accounting',
    });
    return updated;
  }

  async runOne(id, options = {}, userId, meta = {}) {
    const transaction = await this.getById(id);
    assertState(transaction, ACTIVE_STATUSES, 'run');
    return this._execute(transaction, {
      runDate: options.runDate || transaction.nextRunDate || new Date(),
      userId,
      meta,
    });
  }

  async runDue(filters = {}, userId, meta = {}) {
    const due = await recurringRepository.findDue({
      asOfDate: filters.asOfDate || new Date(),
      limit: filters.limit || 100,
    });
    const results = [];
    for (const transaction of due) {
      try {
        results.push(await this._execute(transaction, {
          runDate: transaction.nextRunDate,
          userId,
          meta,
        }));
      } catch (err) {
        results.push({
          recurringTransactionId: transaction._id,
          recurringNumber: transaction.recurringNumber,
          status: 'FAILED',
          errorMessage: err.message,
        });
      }
    }
    return {
      processed: results.length,
      succeeded: results.filter((result) => result.status === 'COMPLETED').length,
      skipped: results.filter((result) => result.status === 'SKIPPED').length,
      failed: results.filter((result) => result.status === 'FAILED').length,
      results,
    };
  }

  async runs(filters = {}) {
    return recurringRepository.recentRuns(filters);
  }

  async _execute(transaction, { runDate, userId, meta = {} }) {
    const effectiveRunDate = asDate(runDate);
    const periodKey = dateOnlyKey(effectiveRunDate);
    const existingRun = await recurringRepository.findRun(transaction._id, periodKey);
    if (existingRun?.status === 'COMPLETED') {
      return {
        recurringTransactionId: transaction._id,
        recurringNumber: transaction.recurringNumber,
        runId: existingRun._id,
        status: 'SKIPPED',
        periodKey,
        generatedEntityType: existingRun.generatedEntityType,
        generatedEntityId: existingRun.generatedEntityId,
      };
    }
    if (existingRun?.status === 'STARTED') {
      throw new AppError(
        `Recurring transaction ${transaction.recurringNumber} is already running for ${periodKey}`,
        409,
        ERROR_CODES.ACCT_RECURRING_RUN_DUPLICATE,
        [{ recurringTransactionId: transaction._id, periodKey }],
      );
    }

    const run = existingRun
      ? await recurringRepository.updateRun(existingRun._id, {
        status: 'STARTED',
        errorMessage: '',
        startedAt: new Date(),
        completedAt: null,
      })
      : await recurringRepository.createRun({
        recurringTransactionId: transaction._id,
        recurringNumber: transaction.recurringNumber,
        periodKey,
        runDate: effectiveRunDate,
        status: 'STARTED',
        createdBy: userId,
      });

    try {
      const entity = await this._generateEntity(transaction, effectiveRunDate, periodKey, userId, meta);
      const nextDate = nextRunDate(effectiveRunDate, transaction.frequency, transaction.interval);
      const newRunCount = Number(transaction.runCount || 0) + 1;
      const isCompletedByCount = transaction.maxRuns && newRunCount >= transaction.maxRuns;
      const isCompletedByEndDate = transaction.endDate && nextDate > asDate(transaction.endDate);
      const nextStatus = isCompletedByCount || isCompletedByEndDate ? 'COMPLETED' : 'ACTIVE';

      const completedRun = await recurringRepository.updateRun(run._id, {
        status: 'COMPLETED',
        generatedEntityType: TYPE_ENTITY_MAP[transaction.transactionType],
        generatedEntityId: entity?._id || entity?.id,
        completedAt: new Date(),
      });

      await recurringRepository.completeExecution(transaction._id, {
        status: nextStatus,
        lastRunDate: effectiveRunDate,
        nextRunDate: nextStatus === 'ACTIVE' ? nextDate : null,
        updatedBy: userId,
      });

      auditService.logEvent({
        eventType: 'accounting.recurring.run_completed',
        userId,
        ipAddress: meta.ipAddress || 'internal',
        userAgent: meta.userAgent,
        result: 'success',
        details: {
          recurringTransactionId: transaction._id,
          runId: completedRun._id,
          generatedEntityType: completedRun.generatedEntityType,
          generatedEntityId: completedRun.generatedEntityId,
        },
        module: 'accounting',
      });

      return {
        recurringTransactionId: transaction._id,
        recurringNumber: transaction.recurringNumber,
        runId: completedRun._id,
        status: 'COMPLETED',
        periodKey,
        generatedEntityType: completedRun.generatedEntityType,
        generatedEntityId: completedRun.generatedEntityId,
        nextRunDate: nextStatus === 'ACTIVE' ? nextDate : null,
      };
    } catch (err) {
      await recurringRepository.updateRun(run._id, {
        status: 'FAILED',
        errorMessage: err.message,
        completedAt: new Date(),
      });
      auditService.logEvent({
        eventType: 'accounting.recurring.run_failed',
        userId,
        ipAddress: meta.ipAddress || 'internal',
        userAgent: meta.userAgent,
        result: 'failure',
        details: {
          recurringTransactionId: transaction._id,
          runId: run._id,
          errorMessage: err.message,
        },
        module: 'accounting',
      });
      logger.warn('Recurring transaction run failed', {
        module: 'accounting',
        action: 'recurring.run',
        recurringTransactionId: transaction._id,
        error: err.message,
      });
      throw err;
    }
  }

  async _generateEntity(transaction, runDate, periodKey, userId, meta) {
    const context = { runDate, periodKey, recurringNumber: transaction.recurringNumber };
    const payload = transaction.templatePayload || {};

    if (transaction.transactionType === 'JOURNAL') {
      return journalEntryService.createManual({
        ...payload,
        entryDate: runDate,
        description: formatTemplateText(payload.description, context),
        referenceType: 'RECURRING_TRANSACTION',
        referenceId: transaction._id,
      }, userId, meta);
    }

    if (transaction.transactionType === 'AP_BILL') {
      const paymentTermsDays = payload.paymentTermsDays ?? 30;
      return apInvoiceService.create({
        ...payload,
        invoiceDate: runDate,
        dueDate: payload.dueDate || addDays(runDate, paymentTermsDays),
        supplierInvoiceNumber: formatUniqueReference(payload.supplierInvoiceNumber, context),
        paymentTermsDays,
      }, userId, meta);
    }

    if (transaction.transactionType === 'AR_INVOICE') {
      const paymentTermsDays = payload.paymentTermsDays ?? 30;
      return invoiceService.create({
        ...payload,
        title: formatTemplateText(payload.title || payload.customerName, context),
        dueDate: payload.dueDate || addDays(runDate, paymentTermsDays),
        paymentTermsDays,
      }, userId, meta);
    }

    throw new AppError(
      `Unsupported recurring transaction type: ${transaction.transactionType}`,
      400,
      ERROR_CODES.ACCT_RECURRING_PAYLOAD_INVALID,
    );
  }

  _validateTemplatePayload(transactionType, payload = {}) {
    if (!transactionType) {
      throw new AppError(
        'Recurring transaction type is required',
        400,
        ERROR_CODES.ACCT_RECURRING_PAYLOAD_INVALID,
      );
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new AppError(
        'Recurring transaction payload must be an object',
        400,
        ERROR_CODES.ACCT_RECURRING_PAYLOAD_INVALID,
      );
    }

    if (transactionType === 'JOURNAL') {
      for (const field of ['description', 'debitAccountId', 'creditAccountId']) {
        if (!payload[field]) {
          throw new AppError(`${field} is required for recurring journals`, 400, ERROR_CODES.ACCT_RECURRING_PAYLOAD_INVALID, [{ field }]);
        }
      }
      assertPositiveNumber(payload.amount, 'amount');
      return {
        ...payload,
        currency: normalizeEnum(payload.currency) || 'CHF',
      };
    }

    if (transactionType === 'AP_BILL') {
      for (const field of ['supplierId', 'supplierName', 'supplierInvoiceNumber']) {
        if (!payload[field]) {
          throw new AppError(`${field} is required for recurring AP bills`, 400, ERROR_CODES.ACCT_RECURRING_PAYLOAD_INVALID, [{ field }]);
        }
      }
      if (!Array.isArray(payload.lineItems) || payload.lineItems.length === 0) {
        throw new AppError('lineItems are required for recurring AP bills', 400, ERROR_CODES.ACCT_RECURRING_PAYLOAD_INVALID);
      }
      return {
        ...payload,
        currency: normalizeEnum(payload.currency) || 'CHF',
      };
    }

    if (transactionType === 'AR_INVOICE') {
      for (const field of ['customerId', 'customerName']) {
        if (!payload[field]) {
          throw new AppError(`${field} is required for recurring invoices`, 400, ERROR_CODES.ACCT_RECURRING_PAYLOAD_INVALID, [{ field }]);
        }
      }
      if (!Array.isArray(payload.lineItems) || payload.lineItems.length === 0) {
        throw new AppError('lineItems are required for recurring invoices', 400, ERROR_CODES.ACCT_RECURRING_PAYLOAD_INVALID);
      }
      return {
        ...payload,
        currency: normalizeEnum(payload.currency) || 'CHF',
      };
    }

    throw new AppError(
      `Unsupported recurring transaction type: ${transactionType}`,
      400,
      ERROR_CODES.ACCT_RECURRING_PAYLOAD_INVALID,
    );
  }
}

const recurringTransactionService = new RecurringTransactionService();
export default recurringTransactionService;
