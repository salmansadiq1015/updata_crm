import fiscalPeriodRepository from './fiscalPeriod.repository.js';
import auditService from '../auth/audit.service.js';
import { AppError, NotFoundError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import logger from '../../shared/logger/index.js';

function startOfDay(value) {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value) {
  const date = new Date(value);
  date.setUTCHours(23, 59, 59, 999);
  return date;
}

class FiscalPeriodService {
  async list(filters = {}) {
    return fiscalPeriodRepository.findAll(filters);
  }

  async getById(id) {
    const period = await fiscalPeriodRepository.findById(id);
    if (!period) throw new NotFoundError('FiscalPeriod', id);
    return period;
  }

  async create(data, userId, meta = {}) {
    const startDate = startOfDay(data.startDate);
    const endDate = endOfDay(data.endDate);
    const overlap = await fiscalPeriodRepository.findOverlapping(startDate, endDate);
    if (overlap) {
      throw new AppError(
        'Fiscal period overlaps an existing period',
        409,
        ERROR_CODES.ACCT_PERIOD_OVERLAP,
        [{ periodId: overlap._id }],
      );
    }

    const period = await fiscalPeriodRepository.create({
      ...data,
      startDate,
      endDate,
      status: data.status || 'OPEN',
      createdBy: userId,
    });

    auditService.logEvent({
      eventType: 'accounting.fiscal_period.created',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { periodId: period._id, startDate, endDate },
      module: 'accounting',
    });

    logger.info('Fiscal period created', {
      module: 'accounting',
      action: 'fiscal_period.create',
      periodId: period._id,
    });

    return period;
  }

  async close(id, reason, userId, meta = {}) {
    const period = await fiscalPeriodRepository.findById(id);
    if (!period) throw new NotFoundError('FiscalPeriod', id);
    if (period.status !== 'OPEN') {
      throw new AppError(
        'Only open fiscal periods can be closed',
        409,
        ERROR_CODES.ACCT_PERIOD_INVALID_TRANSITION,
      );
    }

    const updated = await fiscalPeriodRepository.updateById(id, {
      status: 'CLOSED',
      closeReason: reason,
      closedAt: new Date(),
      closedBy: userId,
      updatedBy: userId,
    });

    auditService.logEvent({
      eventType: 'accounting.fiscal_period.closed',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { periodId: id, reason },
      module: 'accounting',
    });

    return updated;
  }

  async reopen(id, reason, userId, meta = {}) {
    const period = await fiscalPeriodRepository.findById(id);
    if (!period) throw new NotFoundError('FiscalPeriod', id);
    if (period.status !== 'CLOSED') {
      throw new AppError(
        'Only closed fiscal periods can be reopened',
        409,
        ERROR_CODES.ACCT_PERIOD_INVALID_TRANSITION,
      );
    }

    const updated = await fiscalPeriodRepository.updateById(id, {
      status: 'OPEN',
      reopenReason: reason,
      reopenedAt: new Date(),
      reopenedBy: userId,
      updatedBy: userId,
    });

    auditService.logEvent({
      eventType: 'accounting.fiscal_period.reopened',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { periodId: id, reason },
      module: 'accounting',
    });

    return updated;
  }

  async assertPostingDateOpen(date, options = {}) {
    const postingDate = date ? new Date(date) : new Date();
    const period = await fiscalPeriodRepository.findCoveringDate(postingDate, options);
    if (!period) return null;
    if (period.status !== 'OPEN') {
      throw new AppError(
        `Posting date ${postingDate.toISOString().slice(0, 10)} is in a ${period.status.toLowerCase()} fiscal period`,
        409,
        ERROR_CODES.ACCT_PERIOD_CLOSED,
        [{ periodId: period._id, status: period.status }],
      );
    }
    return period;
  }

  async assertDateRangeOpen(startDate, endDate, options = {}) {
    await this.assertPostingDateOpen(startDate, options);
    await this.assertPostingDateOpen(endDate, options);
  }
}

const fiscalPeriodService = new FiscalPeriodService();
export default fiscalPeriodService;
