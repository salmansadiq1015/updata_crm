import contactRepository from './contact.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';
import logger from '../../shared/logger/index.js';

const ENTITY_TTL = { l1Ttl: 60, l2Ttl: 300 };
const LIST_TTL = { l1Ttl: 30, l2Ttl: 120 };

class ContactService {
  async create(customerId, data, createdBy, meta = {}) {
    // Verify customer exists (lazy import to avoid circular deps)
    const customerRepository = (await import('./customer.repository.js')).default;
    const customer = await customerRepository.findById(customerId);
    if (!customer) throw new NotFoundError('Customer', customerId);

    // If first contact for this customer, auto-set isPrimary
    const existing = await contactRepository.findByCustomerId(customerId);
    if (existing.length === 0) {
      data.isPrimary = true;
    }

    // If setting as primary, unset others first
    if (data.isPrimary) {
      await contactRepository.unsetPrimaryForCustomer(customerId);
    }

    const contact = await contactRepository.create({
      ...data,
      customerId,
    });

    await this._invalidateCustomerContactsCache(customerId);

    eventBus.publish(EVENT_TYPES.CONTACT_CREATED, {
      contactId: contact._id,
      customerId,
      fullName: `${contact.firstName} ${contact.lastName}`,
      createdBy,
    }, { source: 'crm:contacts' });

    auditService.logEvent({
      eventType: 'contact.created',
      userId: createdBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { contactId: contact._id, customerId },
      module: 'crm',
    });

    logger.info('Contact created', { module: 'crm', action: 'create', contactId: contact._id, customerId });

    return contactRepository.findById(contact._id);
  }

  async getById(id) {
    const contact = await contactRepository.findById(id);
    if (!contact) throw new NotFoundError('Contact', id);
    return contact;
  }

  async listByCustomer(customerId) {
    const cacheKey = `crm:contacts:customer:${customerId}`;
    return cacheManager.getOrSet(
      cacheKey,
      () => contactRepository.findByCustomerId(customerId),
      LIST_TTL,
    );
  }

  async update(id, data, updatedBy, meta = {}) {
    const existing = await contactRepository.findById(id);
    if (!existing) throw new NotFoundError('Contact', id);

    // If setting as primary, unset others first
    if (data.isPrimary) {
      await contactRepository.unsetPrimaryForCustomer(existing.customerId);
    }

    const updated = await contactRepository.updateById(id, data);
    await this._invalidateCustomerContactsCache(existing.customerId);

    eventBus.publish(EVENT_TYPES.CONTACT_UPDATED, {
      contactId: id,
      customerId: existing.customerId,
      changedFields: Object.keys(data),
      updatedBy,
    }, { source: 'crm:contacts' });

    auditService.logEvent({
      eventType: 'contact.updated',
      userId: updatedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { contactId: id, changedFields: Object.keys(data) },
      module: 'crm',
    });

    return updated;
  }

  async delete(id, deletedBy, meta = {}) {
    const contact = await contactRepository.findById(id);
    if (!contact) throw new NotFoundError('Contact', id);

    if (contact.isPrimary) {
      throw new ConflictError('Cannot delete the primary contact. Please assign a different primary contact first.');
    }

    await contactRepository.softDelete(id);
    await this._invalidateCustomerContactsCache(contact.customerId);

    eventBus.publish(EVENT_TYPES.CONTACT_DELETED, {
      contactId: id,
      customerId: contact.customerId,
      deletedBy,
    }, { source: 'crm:contacts' });

    auditService.logEvent({
      eventType: 'contact.deleted',
      userId: deletedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { contactId: id, customerId: contact.customerId },
      module: 'crm',
    });
  }

  async setPrimary(id, updatedBy, meta = {}) {
    const contact = await contactRepository.findById(id);
    if (!contact) throw new NotFoundError('Contact', id);

    await contactRepository.unsetPrimaryForCustomer(contact.customerId);
    const updated = await contactRepository.updateById(id, { isPrimary: true });
    await this._invalidateCustomerContactsCache(contact.customerId);

    auditService.logEvent({
      eventType: 'contact.set_primary',
      userId: updatedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { contactId: id, customerId: contact.customerId },
      module: 'crm',
    });

    return updated;
  }

  async listAll(limit = 500) {
    const cacheKey = `crm:contacts:all:${limit}`;
    return cacheManager.getOrSet(
      cacheKey,
      () => contactRepository.findAll(limit),
      LIST_TTL,
    );
  }

  async search(searchTerm, limit = 25) {
    return contactRepository.search(searchTerm, limit);
  }

  async _invalidateCustomerContactsCache(customerId) {
    await cacheManager.del(`crm:contacts:customer:${customerId}`);
  }
}

const contactService = new ContactService();
export default contactService;
