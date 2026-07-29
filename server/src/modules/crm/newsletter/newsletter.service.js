import crypto from 'crypto';
import newsletterRepository from './newsletter.repository.js';
import NewsletterDelivery from './newsletterDelivery.model.js';
import Customer from '../customer.model.js';
import config from '../../../config/index.js';
import cacheManager from '../../../shared/cache/CacheManager.js';
import eventBus from '../../../shared/events/EventBus.js';
import EVENT_TYPES from '../../../shared/events/eventTypes.js';
import auditService from '../../auth/audit.service.js';
import queueManager from '../../../shared/queue/QueueManager.js';
import { NotFoundError, ConflictError, ValidationError } from '../../../shared/errors/AppError.js';
import logger from '../../../shared/logger/index.js';

const ENTITY_TTL = { l1Ttl: 60, l2Ttl: 300 };
const LIST_TTL = { l1Ttl: 30, l2Ttl: 120 };

class NewsletterService {
  /**
   * Create a new newsletter draft.
   */
  async create(data, createdBy, meta = {}) {
    const newsletter = await newsletterRepository.create({
      ...data,
      status: 'draft',
      createdBy,
    });

    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.NEWSLETTER_CREATED, {
      newsletterId: newsletter._id,
      subject: newsletter.subject,
      createdBy,
    }, { source: 'crm:newsletters' });

    auditService.logEvent({
      eventType: 'newsletter.created',
      userId: createdBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { newsletterId: newsletter._id, subject: newsletter.subject },
      module: 'crm',
    });

    logger.info('Newsletter created', {
      module: 'crm',
      action: 'newsletter.create',
      newsletterId: newsletter._id,
    });

    return newsletterRepository.findById(newsletter._id);
  }

  /**
   * Get a newsletter by ID with caching.
   */
  async getById(id) {
    const cacheKey = `crm:newsletter:${id}`;
    const newsletter = await cacheManager.getOrSet(
      cacheKey,
      () => newsletterRepository.findById(id),
      ENTITY_TTL,
    );
    if (!newsletter) throw new NotFoundError('Newsletter', id);
    return newsletter;
  }

  /**
   * List newsletters with cursor pagination.
   */
  async list(queryParams) {
    const { cursor, limit, sortBy, sortOrder, search, ...filters } = queryParams;
    const filterKey = Object.entries(filters)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    const cacheKey = `crm:newsletters:list:${cursor || ''}:${limit}:${sortBy}:${sortOrder}:${search || ''}:${filterKey}`;

    return cacheManager.getOrSet(
      cacheKey,
      () => newsletterRepository.findWithCursor({ cursor, limit, sortBy, sortOrder, filters, search }),
      LIST_TTL,
    );
  }

  /**
   * Update a newsletter (only if draft or scheduled).
   */
  async update(id, data, updatedBy, meta = {}) {
    const existing = await this.getById(id);

    if (!['draft', 'scheduled'].includes(existing.status)) {
      throw new ConflictError(`Cannot update newsletter in '${existing.status}' status`);
    }

    const updated = await newsletterRepository.updateById(id, {
      $set: { ...data, updatedBy },
    });

    if (!updated) throw new NotFoundError('Newsletter', id);

    await this._invalidateEntityCache(id);
    await this._invalidateListCache();

    auditService.logEvent({
      eventType: 'newsletter.updated',
      userId: updatedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { newsletterId: id, changes: Object.keys(data) },
      module: 'crm',
    });

    logger.info('Newsletter updated', {
      module: 'crm',
      action: 'newsletter.update',
      newsletterId: id,
    });

    return updated;
  }

  /**
   * Soft delete a newsletter (only if draft).
   */
  async delete(id, deletedBy, meta = {}) {
    const existing = await this.getById(id);

    if (existing.status !== 'draft') {
      throw new ConflictError('Only draft newsletters can be deleted');
    }

    await newsletterRepository.softDelete(id);

    await this._invalidateEntityCache(id);
    await this._invalidateListCache();

    auditService.logEvent({
      eventType: 'newsletter.deleted',
      userId: deletedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { newsletterId: id },
      module: 'crm',
    });

    logger.info('Newsletter deleted', {
      module: 'crm',
      action: 'newsletter.delete',
      newsletterId: id,
    });
  }

  /**
   * Schedule a newsletter for future sending.
   */
  async schedule(id, scheduledAt, userId, meta = {}) {
    const existing = await this.getById(id);

    if (!['draft', 'scheduled'].includes(existing.status)) {
      throw new ConflictError(`Cannot schedule newsletter in '${existing.status}' status`);
    }

    if (new Date(scheduledAt) <= new Date()) {
      throw new ValidationError('Scheduled date must be in the future');
    }

    const updated = await newsletterRepository.updateById(id, {
      $set: {
        status: 'scheduled',
        scheduledAt: new Date(scheduledAt),
        updatedBy: userId,
      },
    });

    await this._invalidateEntityCache(id);
    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.NEWSLETTER_SCHEDULED, {
      newsletterId: id,
      scheduledAt,
      userId,
    }, { source: 'crm:newsletters' });

    auditService.logEvent({
      eventType: 'newsletter.scheduled',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { newsletterId: id, scheduledAt },
      module: 'crm',
    });

    logger.info('Newsletter scheduled', {
      module: 'crm',
      action: 'newsletter.schedule',
      newsletterId: id,
      scheduledAt,
    });

    return updated;
  }

  /**
   * Cancel a scheduled newsletter (set back to draft).
   */
  async cancel(id, userId, meta = {}) {
    const existing = await this.getById(id);

    if (existing.status !== 'scheduled') {
      throw new ConflictError('Only scheduled newsletters can be cancelled');
    }

    const updated = await newsletterRepository.updateById(id, {
      $set: {
        status: 'draft',
        scheduledAt: null,
        updatedBy: userId,
      },
    });

    await this._invalidateEntityCache(id);
    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.NEWSLETTER_CANCELLED, {
      newsletterId: id,
      userId,
    }, { source: 'crm:newsletters' });

    auditService.logEvent({
      eventType: 'newsletter.cancelled',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { newsletterId: id },
      module: 'crm',
    });

    logger.info('Newsletter cancelled', {
      module: 'crm',
      action: 'newsletter.cancel',
      newsletterId: id,
    });

    return updated;
  }

  /**
   * Trigger immediate sending of a newsletter.
   *
   * nDSG compliance: only targets customers with newsletterOptIn: true.
   */
  async send(id, userId, meta = {}) {
    const existing = await this.getById(id);

    if (!['draft', 'scheduled'].includes(existing.status)) {
      throw new ConflictError(`Cannot send newsletter in '${existing.status}' status`);
    }

    // nDSG compliance — build recipient query ensuring opt-in
    const recipientQuery = this._buildRecipientQuery(existing.recipientFilter);

    const recipients = await Customer.find(recipientQuery)
      .select('_id email name')
      .lean();

    if (recipients.length === 0) {
      throw new ValidationError('No opted-in recipients match the filter criteria');
    }

    // Create delivery records in bulk
    const deliveryDocs = recipients.map((r) => ({
      newsletterId: id,
      customerId: r._id,
      email: r.email,
      channel: 'email',
      status: 'pending',
    }));

    await NewsletterDelivery.insertMany(deliveryDocs, { ordered: false }).catch((err) => {
      // Ignore duplicate key errors (E11000) for idempotency
      if (err.code !== 11000 && !err.writeErrors?.every((e) => e.err?.code === 11000)) {
        throw err;
      }
    });

    // Update newsletter status and recipient count
    await newsletterRepository.updateById(id, {
      $set: {
        status: 'sending',
        recipientCount: recipients.length,
        updatedBy: userId,
      },
    });

    // Enqueue the batch dispatch job
    await queueManager.addJob('newsletter-dispatch', 'newsletter-dispatch', {
      newsletterId: id.toString(),
      userId: userId.toString(),
    });

    await this._invalidateEntityCache(id);
    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.NEWSLETTER_SENT, {
      newsletterId: id,
      recipientCount: recipients.length,
      userId,
    }, { source: 'crm:newsletters' });

    auditService.logEvent({
      eventType: 'newsletter.sent',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { newsletterId: id, recipientCount: recipients.length },
      module: 'crm',
    });

    logger.info('Newsletter send triggered', {
      module: 'crm',
      action: 'newsletter.send',
      newsletterId: id,
      recipientCount: recipients.length,
    });

    return newsletterRepository.findById(id);
  }

  /**
   * Revert a sent/sending newsletter back to draft status.
   */
  async revertToDraft(id, userId, meta = {}) {
    const existing = await this.getById(id);

    if (!['sent', 'sending'].includes(existing.status)) {
      throw new ConflictError(`Cannot revert newsletter in '${existing.status}' status — only sent or sending newsletters can be reverted`);
    }

    const updated = await newsletterRepository.updateById(id, {
      $set: {
        status: 'draft',
        sentAt: null,
        updatedBy: userId,
      },
      $unset: {
        'stats.sent': '',
        'stats.delivered': '',
        'stats.failed': '',
        'stats.opened': '',
      },
    });

    await this._invalidateEntityCache(id);
    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.NEWSLETTER_CANCELLED, {
      newsletterId: id,
      userId,
      action: 'revert_to_draft',
    }, { source: 'crm:newsletters' });

    auditService.logEvent({
      eventType: 'newsletter.reverted',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { newsletterId: id, previousStatus: existing.status },
      module: 'crm',
    });

    logger.info('Newsletter reverted to draft', {
      module: 'crm',
      action: 'newsletter.revert',
      newsletterId: id,
      previousStatus: existing.status,
    });

    return updated;
  }

  /**
   * Get delivery stats for a newsletter.
   */
  async getStats(id) {
    const newsletter = await this.getById(id);
    const stats = await newsletterRepository.getDeliveryStats(id);
    return {
      newsletterId: id,
      subject: newsletter.subject,
      status: newsletter.status,
      recipientCount: newsletter.recipientCount,
      stats,
    };
  }

  /**
   * Count opted-in recipients matching a filter (for preview).
   */
  async countRecipients(recipientFilter = {}) {
    const query = this._buildRecipientQuery(recipientFilter);
    return Customer.countDocuments(query);
  }

  // ── Recipient query (CRM-013 AC-2) ─────────────────────────

  /**
   * Translate a structured recipientFilter into a Customer query.
   *
   * Only model-backed fields are mapped explicitly (type → type,
   * canton → canton, city → city). `newsletterOptIn: true` is ALWAYS
   * forced (nDSG opt-out guard) regardless of the filter contents; the
   * `optInOnly` flag is accepted for API symmetry but cannot relax this.
   *
   * Note: "installation type" filtering is intentionally unsupported — the
   * Customer model has no installation-type field (documented limitation).
   */
  _buildRecipientQuery(recipientFilter = {}) {
    const filter = recipientFilter || {};
    const query = {
      isDeleted: false,
      status: 'active',
      email: { $ne: null, $exists: true },
    };

    if (filter.type) query.type = filter.type;
    if (filter.canton) query.canton = filter.canton;
    if (filter.city) query.city = filter.city;

    // Always enforce opt-in (opt-out guard) — never relaxed by the filter.
    query.newsletterOptIn = true;

    return query;
  }

  // ── Unsubscribe (CRM-013 AC-10, nDSG) ──────────────────────

  /**
   * Deterministic HMAC-SHA256 unsubscribe token for a customer.
   *
   * Used to build per-recipient unsubscribe links and to verify the public
   * (unauthenticated) unsubscribe endpoint. Keyed on the session secret so a
   * token cannot be forged without the server secret.
   */
  unsubscribeToken(customerId) {
    return crypto
      .createHmac('sha256', config.session.secret)
      .update(String(customerId))
      .digest('hex');
  }

  /**
   * Verify a token against a customerId in constant-time and, if valid, set
   * the customer's newsletterOptIn to false.
   *
   * @returns {Promise<{ ok: boolean }>}
   * @throws {ValidationError} on a missing/invalid token.
   */
  async unsubscribe(customerId, token) {
    const expected = this.unsubscribeToken(customerId);

    // Constant-time comparison — guard against length mismatch first since
    // timingSafeEqual throws when buffers differ in length.
    const provided = Buffer.from(String(token || ''), 'utf8');
    const expectedBuf = Buffer.from(expected, 'utf8');
    const valid = provided.length === expectedBuf.length
      && crypto.timingSafeEqual(provided, expectedBuf);

    if (!valid) {
      throw new ValidationError('Invalid unsubscribe token');
    }

    await Customer.updateOne(
      { _id: customerId },
      { $set: { newsletterOptIn: false } },
    );

    // Invalidate the customer entity cache so the change is reflected.
    await cacheManager.del(`crm:customer:${customerId}`);

    logger.info('Newsletter unsubscribe processed', {
      module: 'crm',
      action: 'newsletter.unsubscribe',
      customerId: String(customerId),
    });

    return { ok: true };
  }

  // ── Cache helpers ──────────────────────────────────────────

  async _invalidateEntityCache(id) {
    await cacheManager.del(`crm:newsletter:${id}`);
  }

  async _invalidateListCache() {
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}crm:newsletters:list:*`);
  }
}

const newsletterService = new NewsletterService();
export default newsletterService;
