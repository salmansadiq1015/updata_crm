import accountingEntityRepository from './accountingEntity.repository.js';
import auditService from '../auth/audit.service.js';
import { AppError, ConflictError, NotFoundError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeId(value) {
  if (!value) return null;
  return value._id || value;
}

function cleanEntityPayload(data = {}) {
  const payload = {
    ...data,
    entityCode: normalizeCode(data.entityCode),
    parentId: normalizeId(data.parentId),
    legalName: data.legalName || '',
    taxIdentifier: data.taxIdentifier || '',
    status: data.status || 'ACTIVE',
  };
  if (payload.type === 'COMPANY') payload.parentId = null;
  return payload;
}

class AccountingEntityService {
  async list(filters = {}) {
    return accountingEntityRepository.findAll(filters);
  }

  async getById(id) {
    const entity = await accountingEntityRepository.findById(id);
    if (!entity) throw new NotFoundError('AccountingEntity', id);
    return entity;
  }

  async create(data, userId, meta = {}) {
    const payload = cleanEntityPayload(data);
    await this._validateEntityShape(payload);

    const duplicate = await accountingEntityRepository.findByCode(payload.entityCode);
    if (duplicate) throw new ConflictError('Accounting entity code already exists', { entityId: duplicate._id });

    const entity = await accountingEntityRepository.create({
      ...payload,
      createdBy: userId,
    });

    auditService.logEvent({
      eventType: 'accounting.entity.created',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { entityId: entity._id, entityCode: entity.entityCode, type: entity.type },
      module: 'accounting',
    });

    return this.getById(entity._id);
  }

  async update(id, data, userId, meta = {}) {
    const current = await accountingEntityRepository.findById(id);
    if (!current) throw new NotFoundError('AccountingEntity', id);

    const payload = cleanEntityPayload({
      ...current,
      ...data,
      type: current.type,
      entityCode: data.entityCode || current.entityCode,
    });
    await this._validateEntityShape(payload, id);

    if (payload.entityCode !== current.entityCode) {
      const duplicate = await accountingEntityRepository.findByCode(payload.entityCode);
      if (duplicate && String(duplicate._id) !== String(id)) {
        throw new ConflictError('Accounting entity code already exists', { entityId: duplicate._id });
      }
    }

    const updated = await accountingEntityRepository.updateById(id, {
      entityCode: payload.entityCode,
      name: payload.name,
      legalName: payload.legalName,
      parentId: payload.parentId,
      baseCurrency: payload.baseCurrency,
      taxIdentifier: payload.taxIdentifier,
      fiscalYearStartMonth: payload.fiscalYearStartMonth,
      status: payload.status,
      updatedBy: userId,
    });

    auditService.logEvent({
      eventType: 'accounting.entity.updated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { entityId: id, entityCode: updated.entityCode, status: updated.status },
      module: 'accounting',
    });

    return updated;
  }

  async setStatus(id, status, userId, meta = {}) {
    const entity = await accountingEntityRepository.findById(id);
    if (!entity) throw new NotFoundError('AccountingEntity', id);

    const updated = await accountingEntityRepository.updateById(id, {
      status,
      updatedBy: userId,
    });

    auditService.logEvent({
      eventType: 'accounting.entity.status_changed',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { entityId: id, status },
      module: 'accounting',
    });

    return updated;
  }

  async _validateEntityShape(payload, entityId = null) {
    if (payload.type === 'BRANCH') {
      if (!payload.parentId) {
        throw new AppError(
          'Branch accounting entities require a parent company',
          400,
          ERROR_CODES.ACCT_ENTITY_INVALID,
        );
      }
      const parent = await accountingEntityRepository.findById(payload.parentId);
      if (!parent || parent.type !== 'COMPANY') {
        throw new AppError(
          'Branch parent must be an existing company entity',
          400,
          ERROR_CODES.ACCT_ENTITY_INVALID,
        );
      }
      if (entityId && String(payload.parentId) === String(entityId)) {
        throw new AppError(
          'Accounting entity cannot be its own parent',
          400,
          ERROR_CODES.ACCT_ENTITY_INVALID,
        );
      }
    }
    if (payload.type === 'COMPANY' && payload.parentId) {
      throw new AppError(
        'Company accounting entities cannot have a parent',
        400,
        ERROR_CODES.ACCT_ENTITY_INVALID,
      );
    }
  }
}

const accountingEntityService = new AccountingEntityService();
export default accountingEntityService;
