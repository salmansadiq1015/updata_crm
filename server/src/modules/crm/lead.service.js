import leadRepository from './lead.repository.js';
import counterService from './counter.service.js';
import auditService from '../auth/audit.service.js';
import userRepository from '../auth/user.repository.js';
import {
  normalizeName,
  normalizePhone,
  normalizeWebsiteDomain,
} from '../businessDiscovery/engine/normalizer.js';
import { AppError, NotFoundError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import logger from '../../shared/logger/index.js';
import { LEAD_STATUS, LEAD_TYPE } from './lead.model.js';
import { canonicalizeLeadAddress } from './leadGeography.js';
import leadAssignmentService from './leadAssignment.service.js';
import leadSlaService from './leadSla.service.js';
import { onLeadsCreated } from './leadQuality.hooks.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';

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
 * Build a free-text geocoding query from a lead's address. Returns null when
 * there is nothing locatable (a bare country is not enough to place a pin), so
 * the caller can skip the geocoder entirely for address-less leads.
 */
function buildGeocodeQuery(address = {}) {
  const parts = [
    address.street,
    [address.postalCode, address.city].filter(Boolean).join(' '),
    address.canton,
    address.country,
  ]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean);
  // Need at least a street, postcode or city — a lone canton/country can't place a pin.
  const hasLocatable = Boolean(address.street || address.postalCode || address.city);
  return hasLocatable && parts.length ? parts.join(', ') : null;
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
    const address = canonicalizeLeadAddress(data.address ?? {}, {
      source: data.source || 'manual',
    });

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
    // Owner + first-response SLA: an unassigned lead may be auto-assigned by the
    // policy (never reassigns a given owner; never blocks the create).
    const assignment = await leadAssignmentService.prepareNew({ ...data, address });

    const saved = await leadRepository.create({
      ...data,
      ...dedupKeys,
      address,
      ...(data.location ? { location: toGeoJsonLocation(data.location) } : {}),
      ...assignment,
      leadNumber,
      createdBy,
    });
    await leadAssignmentService.afterCreate([saved], createdBy);

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
    onLeadsCreated([saved._id]); // duplicate detection + first score (queued)
    return result;
  }

  /**
   * Resolve the user ids whose name or email matches a search term, so a lead
   * search can match by assignee / creator (a populated ref the list regex can't
   * reach). Best-effort: a user-lookup failure never breaks the lead search.
   */
  async resolveSearchUserIds(term) {
    const trimmed = typeof term === 'string' ? term.trim() : '';
    if (!trimmed) return [];
    try {
      return await userRepository.findIdsByNameOrEmail(trimmed, 50);
    } catch (error) {
      logger.warn('Lead search user-id resolution failed (non-blocking)', {
        module: 'crm', action: 'lead.search.users', error: { message: error.message },
      });
      return [];
    }
  }

  /** Company-wide list (leads are shared; no createdBy scoping). */
  async list(queryParams = {}) {
    const {
      cursor, limit, sortBy, sortOrder, q, search, ...filters
    } = queryParams;
    const term = search ?? q;
    const searchUserIds = await this.resolveSearchUserIds(term);
    return leadRepository.list({
      cursor,
      limit,
      sortBy,
      sortOrder,
      search: term,
      searchUserIds,
      filters,
    });
  }

  /**
   * All leads matching the list filters, projected for the map view. Company-wide
   * (shared), same filter semantics as `list` — just no cursor pagination. Returns
   * { leads, total, withLocation, withoutLocation, limited }.
   */
  async listForMap(queryParams = {}) {
    // Strip the pagination/sort controls the map does not use, so they are never
    // mistaken for lead filters; `limit` is kept (it caps the returned set).
    const {
      cursor, sortBy, sortOrder, limit, q, search, ...filters
    } = queryParams;
    const term = search ?? q;
    const searchUserIds = await this.resolveSearchUserIds(term);
    return leadRepository.listForMap({
      filters,
      search: term,
      searchUserIds,
      limit,
    });
  }

  /** Distinct, live values used by the leads list filter controls. */
  async getFilterOptions(queryParams = {}) {
    const { q, search, ...filters } = queryParams;
    const term = search ?? q;
    const searchUserIds = await this.resolveSearchUserIds(term);
    return leadRepository.getFilterOptions({ filters, search: term, searchUserIds });
  }

  /** Header KPIs for the Leads page (same visible set as the list; cached ≤ 60 s). */
  async getStats() {
    return leadRepository.stats();
  }

  /** Company-wide get (shared). Throws when the lead does not exist. */
  async getById(id) {
    const lead = await leadRepository.getById(id);
    if (!lead) throw new NotFoundError('Lead', id);
    return lead;
  }

  /** Company-wide update (shared). Recomputes dedup keys for changed fields. */
  async update(id, data, meta = {}) {
    let address;
    if (data.address !== undefined) {
      // Address PATCHes are partial. Merge with the persisted address before
      // resolving its hierarchy so changing a street cannot erase a valid
      // country/city or leave stale canonical identifiers behind.
      const current = await leadRepository.getAddressSnapshot(id);
      if (!current) throw new NotFoundError('Lead', id);
      address = canonicalizeLeadAddress({
        ...(current.address ?? {}),
        ...(data.address ?? {}),
        geography: undefined,
      }, { source: current.source || 'manual' });
    }
    // An owner change restarts the first-response SLA (same owner: no-op).
    const assignment = data.assignedTo !== undefined ? await leadAssignmentService.assignmentPatch(id, data.assignedTo) : {};
    const payload = {
      ...data,
      ...deriveDedupKeys(data),
      ...(address ? { address } : {}),
      ...(data.location ? { location: toGeoJsonLocation(data.location) } : {}),
      ...assignment,
    };
    const updated = await leadRepository.update(id, payload);
    if (!updated) throw new NotFoundError('Lead', id);
    if (Object.keys(assignment).length) await leadAssignmentService.afterAssignmentChange([id], data.assignedTo || null, meta.userId);

    auditService.logEvent({
      eventType: 'lead.updated',
      userId: meta.userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { leadId: id, changedFields: Object.keys(data) },
      module: 'lead',
    });
    // Workflow Automation "lead updated" trigger. `meta.workflowId` marks writes made by a
    // workflow so a workflow never re-triggers itself. Fire-and-forget; never throws.
    try {
      eventBus.publish(EVENT_TYPES.CRM_LEAD_UPDATED, {
        leadId: String(id), changedFields: Object.keys(data), status: updated.status ?? null,
        userId: meta.userId ? String(meta.userId) : null, workflowId: meta.workflowId ? String(meta.workflowId) : null,
      }, { source: 'crm:leads' });
    } catch { /* best effort */ }

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

  /**
   * Company-wide bulk soft delete (shared) — ONE updateMany, ONE audit event.
   * Duplicate ids are collapsed; ids that are missing or already deleted come
   * back in `notDeletedIds` so the caller reports an honest result rather than
   * falsely claiming every id was removed.
   */
  async bulkSoftDelete(ids = [], meta = {}) {
    const unique = [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id)))];
    const requested = unique.length;
    if (requested === 0) {
      return { requested: 0, deleted: 0, deletedIds: [], notDeletedIds: [] };
    }

    const { deletedIds } = await leadRepository.bulkSoftDelete(unique);
    const deletedSet = new Set(deletedIds);
    const notDeletedIds = unique.filter((id) => !deletedSet.has(id));

    auditService.logEvent({
      eventType: 'lead.bulk_deleted',
      userId: meta.userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: notDeletedIds.length ? 'partial' : 'success',
      details: { requested, deleted: deletedIds.length, notDeleted: notDeletedIds.length },
      module: 'lead',
    });

    return { requested, deleted: deletedIds.length, deletedIds, notDeletedIds };
  }

  /**
   * Company-wide bulk (re)assign — ONE updateMany, ONE audit event. `assignedTo`
   * null unassigns. Duplicate ids collapse; missing/deleted ids come back in
   * `notUpdatedIds` for an honest result.
   */
  async bulkAssign(ids = [], assignedTo = null, meta = {}) {
    const unique = [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id)))];
    const requested = unique.length;
    if (requested === 0) {
      return { requested: 0, updated: 0, updatedIds: [], notUpdatedIds: [] };
    }

    const Lead = (await import('./lead.model.js')).default;
    const changing = (await Lead.find({ _id: { $in: unique }, assignedTo: { $ne: assignedTo || null } }).select('_id').lean()).map((d) => String(d._id));
    const { updatedIds } = await leadRepository.bulkAssign(unique, assignedTo || null);
    const updatedSet0 = new Set(updatedIds);
    await leadAssignmentService.stampBulkAssignment(changing.filter((id) => updatedSet0.has(id)), assignedTo || null, meta.userId)
      .catch((err) => logger.warn('Bulk assignment SLA stamping failed', { module: 'crm', error: { message: err.message } }));
    const updatedSet = new Set(updatedIds);
    const notUpdatedIds = unique.filter((id) => !updatedSet.has(id));

    auditService.logEvent({
      eventType: 'lead.bulk_assigned',
      userId: meta.userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: notUpdatedIds.length ? 'partial' : 'success',
      details: {
        requested, updated: updatedIds.length, notUpdated: notUpdatedIds.length, assignedTo: assignedTo || null,
      },
      module: 'lead',
    });

    return { requested, updated: updatedIds.length, updatedIds, notUpdatedIds };
  }

  /** GLOBAL dedup ladder lookup (placeId → phone → website → name+postal). */
  async findDuplicates({
    name, postalCode, phone, website, placeId, address, mapsUrl, strictIdentity = false,
  } = {}) {
    if (strictIdentity) return leadRepository.findImportDuplicates({
      name, address, source: 'extension', providerMeta: { mapsUrl }, sourceMetadata: { googlePlaceId: placeId },
    });
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
    const docs = leadDocs.map((doc) => ({
      ...doc,
      ...deriveDedupKeys(doc),
      address: canonicalizeLeadAddress(doc.address ?? {}, { source: doc.source || 'import' }),
    }));
    const assignments = await leadAssignmentService.prepareNewBatch(docs);
    const result = await leadRepository.bulkCreate(docs.map((doc, i) => ({ ...doc, ...assignments[i] })));
    await leadAssignmentService.afterCreate(result.created || [], docs[0]?.createdBy ?? null);
    onLeadsCreated((result.created || []).map((doc) => doc._id), 'import'); // duplicate detection + first score (queued)
    return result;
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

    const contactedAt = new Date();
    await leadRepository.update(leadId, {
      lastContactedAt: contactedAt,
      lastContactChannel: 'whatsapp',
    });
    await leadSlaService.recordFirstResponse(leadId, { at: contactedAt, channel: 'whatsapp' });

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
   * Geocode a lead FROM ITS ADDRESS and, on success, store the resulting
   * coordinates on the lead (§ map view). Uses the shared, provider-abstracted
   * location service (keyless OpenStreetMap/Nominatim by default — no API key,
   * no cost), so a lead that was imported without coordinates can be placed on
   * the map from its street/postcode/city.
   *
   * Honest + non-destructive: never invents a location. When the lead has no
   * usable address, or the geocoder finds nothing / is unavailable, the lead is
   * returned UNCHANGED with `geocoded:false` and a `reason` (not an error), so
   * the UI can report truthfully. Only writes `location` when a real point is
   * found.
   */
  async geocodeLead(leadId, meta = {}) {
    const lead = await leadRepository.getById(leadId);
    if (!lead) throw new NotFoundError('Lead', leadId);

    const query = buildGeocodeQuery(lead.address);
    if (!query) return { lead, geocoded: false, reason: 'no_address' };

    let dto = null;
    try {
      const { default: locationService } = await import('../businessDiscovery/location.service.js');
      dto = await locationService.resolveLocation(query);
    } catch (err) {
      logger.warn('Lead geocoding failed (non-blocking)', {
        module: 'crm', action: 'lead.geocode', leadId, error: { message: err.message },
      });
      return { lead, geocoded: false, reason: 'provider_error' };
    }

    const center = dto?.center;
    if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) {
      return { lead, geocoded: false, reason: 'not_found' };
    }

    const updated = await leadRepository.update(leadId, {
      location: { type: 'Point', coordinates: [center.lng, center.lat] },
    });

    auditService.logEvent({
      eventType: 'lead.geocoded',
      userId: meta.userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { leadId, coordinates: [center.lng, center.lat] },
      module: 'lead',
    });

    logger.info('Lead geocoded from address', {
      module: 'crm', action: 'lead.geocode', leadId,
    });

    return { lead: updated, geocoded: true, formattedAddress: dto.formattedAddress ?? null };
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
