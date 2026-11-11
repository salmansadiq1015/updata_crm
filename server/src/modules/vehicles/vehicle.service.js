import mongoose from 'mongoose';
import Vehicle from './vehicle.model.js';
import VehicleServiceEntry from './vehicleServiceEntry.model.js';
import VehicleMaterial from './vehicleMaterial.model.js';
import VehicleNote from './vehicleNote.model.js';
import VehicleCostEntry from './vehicleCostEntry.model.js';
import VehicleBooking from './vehicleBooking.model.js';
import { vehicleAlerts, healthOf, attentionFilter } from './vehicle.alerts.js';
import { plateKeyOf, escapeRegex } from './vehicle.constants.js';
import auditService from '../auth/audit.service.js';
import logger from '../../shared/logger/index.js';
import {
  NotFoundError, ConflictError, ValidationError, AuthorizationError,
} from '../../shared/errors/AppError.js';

const DRIVER_FIELDS = 'firstName lastName email avatarFileId phone mobile';
const USER_NAME_FIELDS = 'firstName lastName email';
const SORTS = {
  plate: { kennzeichen: 1 },
  '-plate': { kennzeichen: -1 },
  nextService: { nextServiceDate: 1, kennzeichen: 1 },
  meter: { mileageKm: -1 },
  updated: { updatedAt: -1 },
  created: { createdAt: -1 },
};
const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
const PHOTO_MAX_WIDTH = 1600;

const toObjectId = (id) => (id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id)));

function audit(eventType, userId, vehicleId, meta = {}, extra = {}) {
  auditService.logEvent({
    eventType,
    userId,
    ipAddress: meta.ipAddress || 'internal',
    userAgent: meta.userAgent || (meta.source ? `source:${meta.source}` : undefined),
    result: 'success',
    details: { vehicleId, ...(meta.source ? { source: meta.source } : {}), ...extra },
    module: 'vehicles',
  });
}

/** Empty strings from forms mean "clear the field". */
function normalizeInput(data = {}) {
  const out = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    out[key] = value === '' ? null : value;
  }
  if (Array.isArray(out.tags)) {
    out.tags = [...new Set(out.tags.map((t) => String(t).trim()).filter(Boolean))].slice(0, 20);
  }
  return out;
}

class VehicleService {
  // ── Vehicles ────────────────────────────────────────────────────────────
  buildListFilter({ search, status, assetType, attention, driverId } = {}) {
    const filter = {};
    const and = [];
    if (status && status !== 'all') filter.status = status;
    else if (!status) filter.status = { $ne: 'retired' };
    if (assetType && assetType !== 'all') filter.assetType = assetType;
    if (driverId) filter.currentDriverId = toObjectId(driverId);
    const term = String(search || '').trim();
    if (term) {
      const rx = new RegExp(escapeRegex(term), 'i');
      const or = [
        { kennzeichen: rx }, { label: rx }, { make: rx }, { model: rx },
        { fleetNumber: rx }, { vin: rx }, { department: rx }, { location: rx }, { tags: rx },
      ];
      const key = plateKeyOf(term);
      if (key.length >= 2) or.push({ plateKey: new RegExp(escapeRegex(key)) });
      and.push({ $or: or });
    }
    if (attention === true || attention === 'true') {
      const { status: notRetired, ...due } = attentionFilter();
      if (!filter.status) filter.status = notRetired;
      and.push(due);
    }
    if (and.length) filter.$and = and;
    return filter;
  }

  async list(params = {}) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(params.limit) || 50));
    const filter = this.buildListFilter(params);
    const sort = SORTS[params.sort] || SORTS.plate;

    const [rows, total] = await Promise.all([
      Vehicle.find(filter)
        .select('-createdBy -updatedBy -isDeleted -deletedAt -__v')
        .populate('currentDriverId', DRIVER_FIELDS)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Vehicle.countDocuments({ ...filter, isDeleted: false }),
    ]);

    const now = new Date();
    const items = await Promise.all(rows.map(async (v) => {
      const alerts = vehicleAlerts(v, now);
      return { ...v, alerts, health: healthOf(alerts), imageUrl: await this._imageUrl(v.imageFileId) };
    }));
    return { items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
  }

  /** Fleet KPIs in two parallel round trips: one $facet over vehicles, one over costs. */
  async stats() {
    const now = new Date();
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const { status: _ignored, ...dueClause } = attentionFilter(now);
    const overdueClause = {
      $or: [
        ...['nextServiceDate', 'inspectionDue', 'insuranceExpiry', 'registrationExpiry', 'emissionTestDue', 'contractEnd']
          .map((f) => ({ [f]: { $ne: null, $lt: now } })),
        { $expr: { $and: [{ $ne: [{ $ifNull: ['$nextServiceKm', null] }, null] }, { $lt: ['$nextServiceKm', { $ifNull: ['$mileageKm', 0] }] }] } },
      ],
    };

    const [facet] = await Vehicle.aggregate([
      { $match: { isDeleted: false } },
      {
        $facet: {
          byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
          byType: [{ $match: { status: { $ne: 'retired' } } }, { $group: { _id: '$assetType', count: { $sum: 1 } } }],
          attention: [{ $match: { status: { $ne: 'retired' }, ...dueClause } }, { $count: 'n' }],
          overdue: [{ $match: { status: { $ne: 'retired' }, ...overdueClause } }, { $count: 'n' }],
          withDriver: [{ $match: { status: { $ne: 'retired' }, currentDriverId: { $ne: null } } }, { $count: 'n' }],
        },
      },
    ]);

    const [costYtd, serviceYtd] = await Promise.all([
      VehicleCostEntry.aggregate([
        { $match: { isDeleted: false, date: { $gte: yearStart } } },
        { $group: { _id: { $ifNull: ['$currency', 'CHF'] }, amount: { $sum: '$amount' } } },
      ]),
      VehicleServiceEntry.aggregate([
        { $match: { isDeleted: false, date: { $gte: yearStart }, cost: { $gt: 0 } } },
        { $group: { _id: { $ifNull: ['$currency', 'CHF'] }, amount: { $sum: '$cost' } } },
      ]),
    ]);

    const byStatus = Object.fromEntries(facet.byStatus.map((r) => [r._id, r.count]));
    const active = Object.entries(byStatus).filter(([s]) => s !== 'retired').reduce((n, [, c]) => n + c, 0);
    const costs = new Map();
    for (const r of [...costYtd, ...serviceYtd]) costs.set(r._id, (costs.get(r._id) || 0) + r.amount);

    return {
      total: active,
      retired: byStatus.retired || 0,
      byStatus,
      byType: Object.fromEntries(facet.byType.map((r) => [r._id || 'other', r.count])),
      attention: facet.attention[0]?.n || 0,
      overdue: facet.overdue[0]?.n || 0,
      withDriver: facet.withDriver[0]?.n || 0,
      utilization: active ? Math.round(((byStatus.in_use || 0) / active) * 100) : 0,
      costYtd: [...costs.entries()].map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }))
        .sort((a, b) => b.amount - a.amount),
    };
  }

  async getById(id) {
    const vehicle = await Vehicle.findById(id)
      .populate('currentDriverId', DRIVER_FIELDS)
      .populate('createdBy', USER_NAME_FIELDS)
      .populate('updatedBy', USER_NAME_FIELDS)
      .lean();
    if (!vehicle) throw new NotFoundError('Vehicle', id);
    const alerts = vehicleAlerts(vehicle);
    return { ...vehicle, alerts, health: healthOf(alerts), imageUrl: await this._imageUrl(vehicle.imageFileId) };
  }

  /** Plate lookup for the AI agent and imports: exact normalised match first, then partial. */
  async findByPlateOrName(term, limit = 5) {
    const key = plateKeyOf(term);
    if (key.length >= 2) {
      const exact = await Vehicle.find({ plateKey: key }).populate('currentDriverId', DRIVER_FIELDS).limit(limit).lean();
      if (exact.length) return exact;
    }
    return (await this.list({ search: term, limit, status: 'all' })).items;
  }

  async create(data, userId, meta = {}) {
    const input = normalizeInput(data);
    await this._assertPlateFree(input.kennzeichen);
    const vehicle = await Vehicle.create({ ...input, createdBy: userId, updatedBy: userId });
    audit('vehicle.created', userId, vehicle._id, meta, { kennzeichen: vehicle.kennzeichen });
    return this.getById(vehicle._id);
  }

  async update(id, data, userId, meta = {}) {
    const input = normalizeInput(data);
    if (input.kennzeichen) {
      await this._assertPlateFree(input.kennzeichen, id);
      input.plateKey = plateKeyOf(input.kennzeichen);
    }
    const before = await Vehicle.findById(id).select(Object.keys(input).join(' ')).lean();
    if (!before) throw new NotFoundError('Vehicle', id);
    const vehicle = await Vehicle.findByIdAndUpdate(
      id,
      { ...input, updatedBy: userId },
      { returnDocument: 'after', runValidators: true },
    );
    if (!vehicle) throw new NotFoundError('Vehicle', id);
    const changedFields = Object.keys(input).filter((k) => k !== 'plateKey' && String(before[k] ?? '') !== String(input[k] ?? ''));
    audit('vehicle.updated', userId, id, meta, { changedFields });
    return this.getById(id);
  }

  async remove(id, userId, meta = {}) {
    const vehicle = await Vehicle.findByIdAndUpdate(id, { isDeleted: true, deletedAt: new Date(), updatedBy: userId });
    if (!vehicle) throw new NotFoundError('Vehicle', id);
    // Free the vehicle's future reservations so nobody turns up for a car that is gone.
    await VehicleBooking.updateMany(
      { vehicleId: id, status: 'confirmed', end: { $gt: new Date() } },
      { status: 'cancelled', cancelledBy: userId, cancelledAt: new Date() },
    );
    audit('vehicle.deleted', userId, id, meta, { kennzeichen: vehicle.kennzeichen });
    return { deleted: true };
  }

  async assignDriver(id, driverId, userId, meta = {}) {
    if (driverId) {
      const User = mongoose.model('User');
      const exists = await User.exists({ _id: driverId });
      if (!exists) throw new NotFoundError('User', driverId);
    }
    const vehicle = await Vehicle.findByIdAndUpdate(
      id,
      { currentDriverId: driverId || null, updatedBy: userId },
      { returnDocument: 'after' },
    );
    if (!vehicle) throw new NotFoundError('Vehicle', id);
    audit('vehicle.driver_changed', userId, id, meta, { driverId: driverId || null });
    return this.getById(id);
  }

  // ── Photo ───────────────────────────────────────────────────────────────
  /**
   * Stores a vehicle photo re-encoded as WebP (max 1600 px wide, q82): a phone
   * photo of 4–8 MB lands at roughly 150–300 KB with no visible loss.
   */
  async setPhoto(id, file, userId, meta = {}) {
    if (!file?.buffer?.length) throw new ValidationError('No image provided');
    if (file.size > PHOTO_MAX_BYTES) throw new ValidationError('Image is larger than 8 MB');
    if (!/^image\/(jpeg|png|webp|heic|heif|avif|gif)$/i.test(file.mimetype || '')) {
      throw new ValidationError('Only JPEG, PNG, WebP, AVIF, GIF or HEIC images are accepted');
    }
    const vehicle = await Vehicle.findById(id).select('imageFileId kennzeichen').lean();
    if (!vehicle) throw new NotFoundError('Vehicle', id);

    let buffer;
    try {
      const sharp = (await import('sharp')).default;
      buffer = await sharp(file.buffer, { failOn: 'error' })
        .rotate()
        .resize({ width: PHOTO_MAX_WIDTH, withoutEnlargement: true })
        .webp({ quality: 82, effort: 5 })
        .toBuffer();
    } catch (err) {
      throw new ValidationError(`The image could not be read: ${err.message}`);
    }

    const fileService = (await import('../files/file.service.js')).default;
    const stored = await fileService.upload({
      buffer,
      originalName: `${plateKeyOf(vehicle.kennzeichen) || 'vehicle'}.webp`,
      mimeType: 'image/webp',
      sizeBytes: buffer.length,
      module: 'vehicles',
      entityType: 'vehicle-photo',
      entityId: id,
      uploadedBy: userId,
      bucket: 'images',
    });
    await Vehicle.updateOne({ _id: id }, { imageFileId: stored._id, updatedBy: userId });
    if (vehicle.imageFileId) {
      fileService.delete(vehicle.imageFileId).catch(() => {});
    }
    audit('vehicle.photo_changed', userId, id, meta, { sizeBytes: buffer.length });
    return this.getById(id);
  }

  async removePhoto(id, userId, meta = {}) {
    const vehicle = await Vehicle.findByIdAndUpdate(id, { imageFileId: null, updatedBy: userId });
    if (!vehicle) throw new NotFoundError('Vehicle', id);
    if (vehicle.imageFileId) {
      const fileService = (await import('../files/file.service.js')).default;
      fileService.delete(vehicle.imageFileId).catch(() => {});
    }
    audit('vehicle.photo_removed', userId, id, meta);
    return this.getById(id);
  }

  // ── Service log ─────────────────────────────────────────────────────────
  async listServices(vehicleId) {
    return VehicleServiceEntry.find({ vehicleId }).populate('createdBy', 'firstName lastName').sort({ date: -1 }).limit(500).lean();
  }

  async addService(vehicleId, data, userId, meta = {}) {
    const { nextServiceDate, nextServiceKm, ...entryData } = normalizeInput(data);
    const vehicle = await this._assertVehicle(vehicleId, 'mileageKm currency');
    const entry = await VehicleServiceEntry.create({
      ...entryData,
      currency: entryData.currency || vehicle.currency || 'CHF',
      vehicleId,
      createdBy: userId,
    });
    const patch = {};
    if (nextServiceDate !== undefined) patch.nextServiceDate = nextServiceDate;
    if (nextServiceKm !== undefined) patch.nextServiceKm = nextServiceKm;
    if (entry.mileageKm != null && entry.mileageKm > (vehicle.mileageKm || 0)) patch.mileageKm = entry.mileageKm;
    if (Object.keys(patch).length) await Vehicle.updateOne({ _id: vehicleId }, { ...patch, updatedBy: userId });
    await this._syncLastService(vehicleId);
    audit('vehicle.service_added', userId, vehicleId, meta, { serviceId: entry._id, type: entry.type });
    return entry.toObject();
  }

  async deleteService(vehicleId, serviceId, userId, meta = {}) {
    const entry = await VehicleServiceEntry.findOneAndUpdate({ _id: serviceId, vehicleId }, { isDeleted: true, deletedAt: new Date() });
    if (!entry) throw new NotFoundError('Service entry', serviceId);
    // The deleted entry may have been the latest one the KPI tiles show.
    await this._syncLastService(vehicleId);
    audit('vehicle.service_deleted', userId, vehicleId, meta, { serviceId });
    return { deleted: true };
  }

  async _syncLastService(vehicleId) {
    const latest = await VehicleServiceEntry.findOne({ vehicleId }).sort({ date: -1, createdAt: -1 }).lean();
    await Vehicle.updateOne({ _id: vehicleId }, {
      lastServiceDate: latest?.date ?? null,
      lastServiceKm: latest?.mileageKm ?? null,
      lastServiceGarage: latest?.garage ?? null,
    });
  }

  // ── Costs ───────────────────────────────────────────────────────────────
  async listCosts(vehicleId, { from, to, type } = {}) {
    const match = { vehicleId: toObjectId(vehicleId), isDeleted: false };
    if (type && type !== 'all') match.type = type;
    if (from || to) match.date = { ...(from ? { $gte: new Date(from) } : {}), ...(to ? { $lte: new Date(to) } : {}) };

    const serviceMatch = { vehicleId: match.vehicleId, isDeleted: false, cost: { $gt: 0 } };
    if (match.date) serviceMatch.date = match.date;
    const includeServices = !type || type === 'all' || type === 'service';

    const [items, byType, services, fuel] = await Promise.all([
      type === 'service' ? [] : VehicleCostEntry.find(match).populate('createdBy', 'firstName lastName').sort({ date: -1 }).limit(500).lean(),
      type === 'service' ? [] : VehicleCostEntry.aggregate([
        { $match: match },
        { $group: { _id: { type: '$type', currency: { $ifNull: ['$currency', 'CHF'] } }, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      includeServices ? VehicleServiceEntry.aggregate([
        { $match: serviceMatch },
        { $group: { _id: { $ifNull: ['$currency', 'CHF'] }, amount: { $sum: '$cost' }, count: { $sum: 1 } } },
      ]) : [],
      VehicleCostEntry.aggregate([
        { $match: { vehicleId: match.vehicleId, isDeleted: false, type: { $in: ['fuel', 'charging'] }, quantity: { $gt: 0 }, meterReading: { $gt: 0 } } },
        { $sort: { meterReading: 1 } },
        { $group: { _id: '$quantityUnit', first: { $first: '$meterReading' }, last: { $last: '$meterReading' }, quantity: { $sum: '$quantity' }, firstQty: { $first: '$quantity' }, fills: { $sum: 1 } } },
      ]),
    ]);

    const totals = new Map();
    const typeRows = byType.map((r) => ({ type: r._id.type, currency: r._id.currency, amount: r.amount, count: r.count }));
    for (const s of services) typeRows.push({ type: 'service', currency: s._id, amount: s.amount, count: s.count });
    for (const r of typeRows) totals.set(r.currency, (totals.get(r.currency) || 0) + r.amount);

    // Average consumption between the first and last fill: the first fill's
    // quantity was burnt before the window started, so it is left out.
    const consumption = fuel.map((f) => {
      const distance = f.last - f.first;
      const qty = f.quantity - f.firstQty;
      return {
        unit: f._id,
        fills: f.fills,
        quantity: f.quantity,
        per100: distance > 0 && qty > 0 && f.fills > 1 ? Math.round((qty / distance) * 10000) / 100 : null,
      };
    });

    return {
      items,
      summary: {
        totals: [...totals.entries()].map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }))
          .sort((a, b) => b.amount - a.amount),
        byType: typeRows.sort((a, b) => b.amount - a.amount),
        consumption,
      },
    };
  }

  async addCost(vehicleId, data, userId, meta = {}) {
    const input = normalizeInput(data);
    const vehicle = await this._assertVehicle(vehicleId, 'mileageKm currency');
    const entry = await VehicleCostEntry.create({
      ...input,
      currency: input.currency || vehicle.currency || 'CHF',
      vehicleId,
      createdBy: userId,
    });
    if (entry.meterReading != null && entry.meterReading > (vehicle.mileageKm || 0)) {
      await Vehicle.updateOne({ _id: vehicleId }, { mileageKm: entry.meterReading, updatedBy: userId });
    }
    audit('vehicle.cost_added', userId, vehicleId, meta, { costId: entry._id, type: entry.type, amount: entry.amount });
    return entry.toObject();
  }

  async deleteCost(vehicleId, costId, userId, meta = {}) {
    const entry = await VehicleCostEntry.findOneAndUpdate({ _id: costId, vehicleId }, { isDeleted: true, deletedAt: new Date() });
    if (!entry) throw new NotFoundError('Cost entry', costId);
    audit('vehicle.cost_deleted', userId, vehicleId, meta, { costId });
    return { deleted: true };
  }

  // ── Bookings ────────────────────────────────────────────────────────────
  async listBookings(vehicleId, { includePast = false } = {}) {
    const filter = { vehicleId, status: 'confirmed' };
    if (!includePast) filter.end = { $gte: new Date(Date.now() - 7 * 86_400_000) };
    return VehicleBooking.find(filter)
      .populate('bookedFor', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName')
      .sort({ start: 1 })
      .limit(200)
      .lean();
  }

  async addBooking(vehicleId, data, user, meta = {}) {
    const userId = user._id;
    const bookedFor = data.bookedFor || userId;
    if (String(bookedFor) !== String(userId) && !user.canWrite) {
      throw new AuthorizationError('Only fleet managers can book a vehicle for someone else');
    }
    const start = new Date(data.start);
    const end = new Date(data.end);
    if (!(end > start)) throw new ValidationError('The booking must end after it starts');

    const vehicle = await this._assertVehicle(vehicleId, 'status kennzeichen');
    if (['retired', 'out_of_service'].includes(vehicle.status)) {
      throw new ConflictError('This vehicle cannot be booked in its current status', { code: 'VEHICLE_UNAVAILABLE' });
    }
    await this._assertNoOverlap(vehicleId, start, end);

    const booking = await VehicleBooking.create({
      vehicleId, bookedFor, start, end,
      purpose: data.purpose || null,
      destination: data.destination || null,
      createdBy: userId,
    });

    // Two people booking the same slot at the same instant both pass the
    // check above. The later write yields: it re-checks against everything
    // created before it and withdraws itself on a clash.
    const clash = await VehicleBooking.findOne({
      _id: { $ne: booking._id }, vehicleId, status: 'confirmed',
      start: { $lt: end }, end: { $gt: start }, createdAt: { $lte: booking.createdAt },
    }).lean();
    if (clash) {
      await VehicleBooking.deleteOne({ _id: booking._id });
      throw new ConflictError('The vehicle is already booked in this period', { code: 'BOOKING_OVERLAP', bookingId: clash._id });
    }

    audit('vehicle.booking_created', userId, vehicleId, meta, { bookingId: booking._id, start, end, bookedFor });
    return VehicleBooking.findById(booking._id).populate('bookedFor', 'firstName lastName email').lean();
  }

  async cancelBooking(vehicleId, bookingId, user, meta = {}) {
    const booking = await VehicleBooking.findOne({ _id: bookingId, vehicleId, status: 'confirmed' }).lean();
    if (!booking) throw new NotFoundError('Booking', bookingId);
    const own = [booking.bookedFor, booking.createdBy].some((id) => id && String(id) === String(user._id));
    if (!own && !user.canWrite) throw new AuthorizationError('You can only cancel your own bookings');
    await VehicleBooking.updateOne({ _id: bookingId }, { status: 'cancelled', cancelledBy: user._id, cancelledAt: new Date() });
    audit('vehicle.booking_cancelled', user._id, vehicleId, meta, { bookingId });
    return { cancelled: true };
  }

  async _assertNoOverlap(vehicleId, start, end) {
    const clash = await VehicleBooking.findOne({
      vehicleId, status: 'confirmed', start: { $lt: end }, end: { $gt: start },
    }).populate('bookedFor', 'firstName lastName').lean();
    if (clash) {
      const who = [clash.bookedFor?.firstName, clash.bookedFor?.lastName].filter(Boolean).join(' ');
      throw new ConflictError(`The vehicle is already booked in this period${who ? ` (${who})` : ''}`, { code: 'BOOKING_OVERLAP', bookingId: clash._id });
    }
  }

  // ── Materials ───────────────────────────────────────────────────────────
  async listMaterials(vehicleId) {
    return VehicleMaterial.find({ vehicleId }).sort({ createdAt: 1 }).limit(1000).lean();
  }

  async addMaterial(vehicleId, data, userId, meta = {}) {
    await this._assertVehicle(vehicleId);
    const item = await VehicleMaterial.create({ ...normalizeInput(data), vehicleId, createdBy: userId });
    audit('vehicle.material_added', userId, vehicleId, meta, { materialId: item._id });
    return item.toObject();
  }

  async deleteMaterial(vehicleId, materialId, userId, meta = {}) {
    const item = await VehicleMaterial.findOneAndUpdate({ _id: materialId, vehicleId }, { isDeleted: true, deletedAt: new Date() });
    if (!item) throw new NotFoundError('Material', materialId);
    audit('vehicle.material_deleted', userId, vehicleId, meta, { materialId });
    return { deleted: true };
  }

  // ── Notes ───────────────────────────────────────────────────────────────
  async listNotes(vehicleId) {
    return VehicleNote.find({ vehicleId }).populate('createdBy', 'firstName lastName').sort({ createdAt: -1 }).limit(500).lean();
  }

  async addNote(vehicleId, data, userId, meta = {}) {
    await this._assertVehicle(vehicleId);
    const note = await VehicleNote.create({ ...data, vehicleId, createdBy: userId });
    audit('vehicle.note_added', userId, vehicleId, meta, { noteId: note._id });
    return VehicleNote.findById(note._id).populate('createdBy', 'firstName lastName').lean();
  }

  async deleteNote(vehicleId, noteId, userId, meta = {}) {
    const note = await VehicleNote.findOneAndUpdate({ _id: noteId, vehicleId }, { isDeleted: true, deletedAt: new Date() });
    if (!note) throw new NotFoundError('Note', noteId);
    audit('vehicle.note_deleted', userId, vehicleId, meta, { noteId });
    return { deleted: true };
  }

  // ── History (audit timeline) ────────────────────────────────────────────
  /** Audit trail of a vehicle, with the acting user resolved to a name. */
  async listHistory(vehicleId) {
    const entries = await auditService.queryByEntity({ module: 'vehicles', detailsKey: 'vehicleId', entityId: [String(vehicleId), vehicleId], limit: 100 });
    return auditService.withUserNames(entries);
  }

  // ── Internals ───────────────────────────────────────────────────────────
  async _assertVehicle(id, select = '_id') {
    const vehicle = await Vehicle.findById(id).select(select).lean();
    if (!vehicle) throw new NotFoundError('Vehicle', id);
    return vehicle;
  }

  async _assertPlateFree(plate, exceptId = null) {
    const key = plateKeyOf(plate);
    if (!key) throw new ValidationError('A license plate is required');
    const filter = { plateKey: key };
    if (exceptId) filter._id = { $ne: exceptId };
    const existing = await Vehicle.findOne(filter).select('_id kennzeichen').lean();
    if (existing) {
      throw new ConflictError(`A vehicle with plate ${existing.kennzeichen} already exists`, { code: 'PLATE_EXISTS', vehicleId: existing._id });
    }
  }

  async _imageUrl(fileId) {
    if (!fileId) return null;
    try {
      const fileService = (await import('../files/file.service.js')).default;
      return await fileService.getDownloadUrl(fileId);
    } catch (err) {
      logger.warn('Vehicle photo URL could not be resolved', { module: 'vehicles', fileId: String(fileId), error: err.message });
      return null;
    }
  }
}

const vehicleService = new VehicleService();
export default vehicleService;
