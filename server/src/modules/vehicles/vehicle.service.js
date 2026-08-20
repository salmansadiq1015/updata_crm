import Vehicle from './vehicle.model.js';
import VehicleServiceEntry from './vehicleServiceEntry.model.js';
import VehicleMaterial from './vehicleMaterial.model.js';
import VehicleNote from './vehicleNote.model.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError } from '../../shared/errors/AppError.js';

const DRIVER_FIELDS = 'firstName lastName email avatarFileId phone mobile';

function audit(eventType, userId, vehicleId, meta = {}, extra = {}) {
  auditService.logEvent({
    eventType,
    userId,
    ipAddress: meta.ipAddress || 'internal',
    userAgent: meta.userAgent,
    result: 'success',
    details: { vehicleId, ...extra },
    module: 'vehicles',
  });
}

class VehicleService {
  // ── Vehicles ────────────────────────────────────────────────────────────
  async list({ search, status } = {}) {
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (search) filter.$or = [
      { kennzeichen: new RegExp(search, 'i') },
      { label: new RegExp(search, 'i') },
      { make: new RegExp(search, 'i') },
      { model: new RegExp(search, 'i') },
    ];
    return Vehicle.find(filter)
      .populate('currentDriverId', DRIVER_FIELDS)
      .sort({ kennzeichen: 1 })
      .lean();
  }

  async getById(id) {
    const vehicle = await Vehicle.findById(id).populate('currentDriverId', DRIVER_FIELDS).lean();
    if (!vehicle) throw new NotFoundError('Vehicle', id);
    return vehicle;
  }

  async create(data, userId, meta = {}) {
    const vehicle = await Vehicle.create({ ...data, createdBy: userId, updatedBy: userId });
    audit('vehicle.created', userId, vehicle._id, meta, { kennzeichen: vehicle.kennzeichen });
    return this.getById(vehicle._id);
  }

  async update(id, data, userId, meta = {}) {
    const vehicle = await Vehicle.findByIdAndUpdate(
      id,
      { ...data, updatedBy: userId },
      { new: true, runValidators: true },
    );
    if (!vehicle) throw new NotFoundError('Vehicle', id);
    audit('vehicle.updated', userId, id, meta, { changedFields: Object.keys(data) });
    return this.getById(id);
  }

  async remove(id, userId, meta = {}) {
    const vehicle = await Vehicle.findByIdAndUpdate(id, { isDeleted: true, deletedAt: new Date() });
    if (!vehicle) throw new NotFoundError('Vehicle', id);
    audit('vehicle.deleted', userId, id, meta);
    return { deleted: true };
  }

  async assignDriver(id, driverId, userId, meta = {}) {
    const vehicle = await Vehicle.findByIdAndUpdate(
      id,
      { currentDriverId: driverId || null, updatedBy: userId },
      { new: true },
    );
    if (!vehicle) throw new NotFoundError('Vehicle', id);
    audit('vehicle.driver_changed', userId, id, meta, { driverId: driverId || null });
    return this.getById(id);
  }

  // ── Service log ─────────────────────────────────────────────────────────
  async listServices(vehicleId) {
    return VehicleServiceEntry.find({ vehicleId }).populate('createdBy', 'firstName lastName').sort({ date: -1 }).lean();
  }

  async addService(vehicleId, data, userId, meta = {}) {
    await this._assertVehicle(vehicleId);
    const entry = await VehicleServiceEntry.create({ ...data, vehicleId, createdBy: userId });
    // Keep the vehicle's "last service" KPI in sync with the newest entry.
    const latest = await VehicleServiceEntry.findOne({ vehicleId }).sort({ date: -1 }).lean();
    if (latest && String(latest._id) === String(entry._id)) {
      await Vehicle.findByIdAndUpdate(vehicleId, {
        lastServiceDate: entry.date,
        lastServiceKm: entry.mileageKm ?? null,
        lastServiceGarage: entry.garage ?? null,
      });
    }
    audit('vehicle.service_added', userId, vehicleId, meta, { serviceId: entry._id });
    return entry.toObject();
  }

  async deleteService(vehicleId, serviceId, userId, meta = {}) {
    await VehicleServiceEntry.findOneAndUpdate({ _id: serviceId, vehicleId }, { isDeleted: true, deletedAt: new Date() });
    audit('vehicle.service_deleted', userId, vehicleId, meta, { serviceId });
    return { deleted: true };
  }

  // ── Materials ───────────────────────────────────────────────────────────
  async listMaterials(vehicleId) {
    return VehicleMaterial.find({ vehicleId }).sort({ createdAt: 1 }).lean();
  }

  async addMaterial(vehicleId, data, userId, meta = {}) {
    await this._assertVehicle(vehicleId);
    const item = await VehicleMaterial.create({ ...data, vehicleId, createdBy: userId });
    audit('vehicle.material_added', userId, vehicleId, meta, { materialId: item._id });
    return item.toObject();
  }

  async deleteMaterial(vehicleId, materialId, userId, meta = {}) {
    await VehicleMaterial.findOneAndUpdate({ _id: materialId, vehicleId }, { isDeleted: true, deletedAt: new Date() });
    audit('vehicle.material_deleted', userId, vehicleId, meta, { materialId });
    return { deleted: true };
  }

  // ── Notes ───────────────────────────────────────────────────────────────
  async listNotes(vehicleId) {
    return VehicleNote.find({ vehicleId }).populate('createdBy', 'firstName lastName').sort({ createdAt: -1 }).lean();
  }

  async addNote(vehicleId, data, userId, meta = {}) {
    await this._assertVehicle(vehicleId);
    const note = await VehicleNote.create({ ...data, vehicleId, createdBy: userId });
    audit('vehicle.note_added', userId, vehicleId, meta, { noteId: note._id });
    return VehicleNote.findById(note._id).populate('createdBy', 'firstName lastName').lean();
  }

  async deleteNote(vehicleId, noteId, userId, meta = {}) {
    await VehicleNote.findOneAndUpdate({ _id: noteId, vehicleId }, { isDeleted: true, deletedAt: new Date() });
    audit('vehicle.note_deleted', userId, vehicleId, meta, { noteId });
    return { deleted: true };
  }

  // ── History (audit timeline) ────────────────────────────────────────────
  /** Audit trail of a vehicle, with the acting user resolved to a name. */
  async listHistory(vehicleId) {
    const entries = await auditService.queryByEntity({ module: 'vehicles', detailsKey: 'vehicleId', entityId: [String(vehicleId), vehicleId], limit: 100 });
    return auditService.withUserNames(entries);
  }

  async _assertVehicle(id) {
    const exists = await Vehicle.exists({ _id: id });
    if (!exists) throw new NotFoundError('Vehicle', id);
  }
}

const vehicleService = new VehicleService();
export default vehicleService;
