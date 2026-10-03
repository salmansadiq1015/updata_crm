import leadRepository from './lead.repository.js';
import counterService from './counter.service.js';
import auditService from '../auth/audit.service.js';
import {
  normalizeName,
  normalizePhone,
  normalizeWebsiteDomain,
} from '../businessDiscovery/engine/normalizer.js';
import { AppError, NotFoundError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import logger from '../../shared/logger/index.js';
import { LEAD_STATUS, LEAD_TYPE } from './lead.model.js';

/**
 * Lead service (§4.3 / §9 / §72 of LEAD_GENERATION_DESIGN.md).
 *
 * Leads are SHARED company-wide (single-tenant): list / getById / update /
 * softDelete do NOT scope by createdBy (mirrors customers). createdBy is still
 * stored on create for provenance. Dedup / matching is GLOBAL.
 */

/** Derive the comparison/dedup keys the model stores alongside the raw values. */
function deriveDedupKeys(data = {}) {
  const keys = {};
  if (data.name !== undefined) keys.normalizedName = data.name ? normalizeName(data.name) : null;
  if (data.phone !== undefined || data.mobile !== undefined) {
    const source = data.phone || data.mobile || null;
    keys.normalizedPhone = source ? normalizePhone(source).e164 : null;
  }
  if (data.website !== undefined) keys.websiteDomain = data.website ? normalizeWebsiteDomain(data.website) : null;
  return keys;
}

function toPlain(doc) {
  if (!doc) return doc;
  return typeof doc.toObject === 'function' ? doc.toObject() : doc;
}

/**
 * Normalize an incoming location to the GeoJSON Point the model stores. The
 * manual form sends a flat { lat, lng }; imports / discovery already send
 * GeoJSON ({ type: 'Point', coordinates: [lng, lat] }). Anything else (already
 * GeoJSON, null, undefined) is returned untouched.
 */
function toGeoJsonLocation(location) {
  if (!location || typeof location !== 'object' || Array.isArray(location)) return location;
  if (Array.isArray(location.coordinates)) return location; // already GeoJSON
  if (typeof location.lat === 'number' && typeof location.lng === 'number') {
    return { type: 'Point', coordinates: [location.lng, location.lat] };
  }
  return location;
}

class LeadService {
  /**
   * Create a lead. Computes the normalized dedup keys, runs a NON-blocking
   * duplicate check (warn only, never aborts the create), allocates the
   * L-##### number, persists with createdBy and audits the event.
   */
  async create(data, createdBy, meta = {}) {
    const dedupKeys = deriveDedupKeys(data);

    // Non-blocking global duplicate warning (§8). A dedup failure must never
    // prevent lead creation.
    let duplicateWarning = false;
    try {
      const candidates = await leadRepository.findDuplicates({
        name: data.name,
        postalCode: data.address?.postalCode,
        normalizedPhone: dedupKeys.normalizedPhone,
        websiteDomain: dedupKeys.websiteDomain,
        googlePlaceId: data.sourceMetadata?.googlePlaceId,
      });
      duplicateWarning = candidates.length > 0;
    } catch (err) {
      logger.warn('Lead duplicate pre-check failed (non-blocking)', {
        module: 'crm', action: 'lead.create', error: { message: err.message },
      });
    }

    const leadNumber = await counterService.getNextLeadNumber();

    const saved = await leadRepository.create({
      ...data,
      ...dedupKeys,
      ...(data.location ? { location: toGeoJsonLocation(data.location) } : {}),
      leadNumber,
      createdBy,
    });

    auditService.logEvent({
      eventType: 'lead.created',
      userId: createdBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { leadId: saved._id, leadNumber, source: saved.source },
      module: 'lead',
    });

    logger.info('Lead created', {
      module: 'crm', action: 'lead.create', leadId: saved._id, leadNumber,
    });

    const result = toPlain(saved);
    result.duplicateWarning = duplicateWarning;
    return result;
  }

  /** Company-wide list (leads are shared; no createdBy scoping). */
  async list(queryParams = {}) {
    const {
      cursor, limit, sortBy, sortOrder, q, search, ...filters
    } = queryParams;
    return leadRepository.list({
      cursor,
      limit,
      sortBy,
      sortOrder,
      search: search ?? q,
      filters,
    });
  }

  /** Company-wide get (shared). Throws when the lead does not exist. */
  async getById(id) {
    const lead = await leadRepository.getById(id);
    if (!lead) throw new NotFoundError('Lead', id);
    return lead;
  }

  /** Company-wide update (shared). Recomputes dedup keys for changed fields. */
  async update(id, data, meta = {}) {
    const payload = {
      ...data,
      ...deriveDedupKeys(data),
      ...(data.location ? { location: toGeoJsonLocation(data.location) } : {}),
    };
    const updated = await leadRepository.update(id, payload);
    if (!updated) throw new NotFoundError('Lead', id);

    auditService.logEvent({
      eventType: 'lead.updated',
      userId: meta.userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { leadId: id, changedFields: Object.keys(data) },
      module: 'lead',
    });

    return updated;
  }

  /** Company-wide soft delete (shared). */
  async softDelete(id, meta = {}) {
    const deleted = await leadRepository.softDelete(id);
    if (!deleted) throw new NotFoundError('Lead', id);

    auditService.logEvent({
      eventType: 'lead.deleted',
      userId: meta.userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { leadId: id },
      module: 'lead',
    });

    return { id, deleted: true };
  }

  /** GLOBAL dedup ladder lookup (placeId → phone → website → name+postal). */
  async findDuplicates({
    name, postalCode, phone, website, placeId,
  } = {}) {
    return leadRepository.findDuplicates({
      name,
      postalCode,
      normalizedPhone: phone ? normalizePhone(phone).e164 : undefined,
      websiteDomain: website ? normalizeWebsiteDomain(website) : undefined,
      googlePlaceId: placeId || undefined,
    });
  }

  /**
   * Bulk create leads (used by the import service). Per-row outcome with the
   * unique partial googlePlaceId index surfacing duplicate-key write errors.
   */
  async bulkCreate(leadDocs = []) {
    const docs = leadDocs.map((doc) => ({ ...doc, ...deriveDedupKeys(doc) }));
    return leadRepository.bulkCreate(docs);
  }

  /**
   * Convert a lead into a Customer (§4.3). Idempotent against double-convert:
   * a lead already linked to a customer throws LEAD_CONVERT_FAILED. Maps the
   * lead's address block → the flat customer address fields, reuses
   * customerService.create, then links the lead (convertedCustomerId / status /
   * convertedAt). An optional note is attached additively to the customer.
   */
  async convertToCustomer(leadId, { assignedTo, note } = {}, userId, meta = {}) {
    const lead = await leadRepository.getById(leadId);
    if (!lead) throw new NotFoundError('Lead', leadId);
    if (lead.convertedCustomerId) {
      throw new AppError(
        'Lead has already been converted to a customer',
        409,
        ERROR_CODES.LEAD_CONVERT_FAILED,
      );
    }

    const customerPayload = {
      name: lead.name,
      type: lead.type === LEAD_TYPE.PRIVATE ? 'private' : 'business',
      street: lead.address?.street ?? null,
      addressSupplement: lead.address?.addressSupplement ?? null,
      postalCode: lead.address?.postalCode ?? null,
      city: lead.address?.city ?? null,
      canton: lead.address?.canton ?? null,
      country: lead.address?.country || 'CH',
      phone: lead.phone ?? null,
      mobile: lead.mobile ?? null,
      email: lead.email ?? null,
      website: lead.website ?? null,
    };

    // Lazy import to avoid any module cycle (crm ↔ crm).
    const { default: customerService } = await import('./customer.service.js');
    const customer = await customerService.create(customerPayload, userId, meta);

    // Optional additive note on the new customer (graceful if unavailable).
    if (note) {
      try {
        const { default: entityNoteService } = await import('./entityNote.service.js');
        await entityNoteService.create(
          'customer',
          customer._id,
          { text: note, category: 'general' },
          userId,
          meta,
        );
      } catch (err) {
        logger.warn('Could not attach conversion note (ignored)', {
          module: 'crm', action: 'lead.convert', leadId, error: { message: err.message },
        });
      }
    }

    const updatePayload = {
      convertedCustomerId: customer._id,
      status: LEAD_STATUS.CONVERTED,
      convertedAt: new Date(),
    };
    if (assignedTo !== undefined) updatePayload.assignedTo = assignedTo;

    const updatedLead = await leadRepository.update(leadId, updatePayload);

    auditService.logEvent({
      eventType: 'lead.converted',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { leadId, customerId: customer._id, customerNumber: customer.customerNumber },
      module: 'lead',
    });

    logger.info('Lead converted to customer', {
      module: 'crm', action: 'lead.convert', leadId, customerId: customer._id,
    });

    return { lead: updatedLead, customerId: customer._id };
  }

  /**
   * Log a WhatsApp contact for a lead. The server does NOT send anything —
   * delivery happens in the client, which opens https://wa.me/<waNumber>?text=…
   * This records that the chat was opened: a contactLog entry on the lead, the
   * lead's "last contacted" marker, and an audit event. Never claims delivery.
   *
   * Returns { waNumber, logged } where waNumber is the E.164 number without the
   * leading '+', ready for the wa.me URL the client builds.
   */
  async logWhatsApp(leadId, { message } = {}, actor, meta = {}) {
    const lead = await leadRepository.getById(leadId);
    if (!lead) throw new NotFoundError('Lead', leadId);

    const phoneSource = lead.phone || lead.mobile;
    const { e164, valid } = normalizePhone(phoneSource || '');
    if (!valid) {
      throw new AppError(
        'No WhatsApp-capable phone number',
        400,
        ERROR_CODES.INVALID_INPUT,
      );
    }
    const waNumber = e164.replace('+', '');

    // Lazy import to avoid a crm ↔ crm module cycle (contactLog → tasks → …).
    const { default: contactLogService } = await import('./contactLog.service.js');
    const note = (typeof message === 'string' && message.trim())
      ? message.slice(0, 2000)
      : 'WhatsApp opened';
    await contactLogService.create(
      null,
      {
        leadId,
        channel: 'whatsapp',
        subject: 'WhatsApp opened',
        note,
        employeeId: actor,
      },
      actor,
      meta,
    );

    await leadRepository.update(leadId, {
      lastContactedAt: new Date(),
      lastContactChannel: 'whatsapp',
    });

    auditService.logEvent({
      eventType: 'lead.whatsapp_opened',
      userId: actor,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { leadId, waNumber },
      module: 'lead',
    });

    logger.info('Lead WhatsApp opened', {
      module: 'crm', action: 'lead.whatsapp', leadId,
    });

    return { waNumber, logged: true };
  }

  /**
   * A lead's logged communications (contact-log entries), newest first. Email
   * history is served separately by the doctpl emails list (sourceModule
   * 'lead'), so it is intentionally not merged in here.
   */
  async listCommunications(leadId) {
    const lead = await leadRepository.getById(leadId);
    if (!lead) throw new NotFoundError('Lead', leadId);

    const { default: contactLogService } = await import('./contactLog.service.js');
    return contactLogService.listByLead(leadId);
  }
}

const leadService = new LeadService();
export default leadService;
