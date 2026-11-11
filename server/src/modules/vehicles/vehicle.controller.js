import vehicleService from './vehicle.service.js';
import ciService from '../doctpl/ci.service.js';
import ciRenderAssetsService from '../doctpl/ciRenderAssets.service.js';
import { renderVehicleMaterialPdf } from './vehicleMaterialPdf.renderer.js';
import { loadUserPermissions, satisfiesPermission } from '../../shared/middleware/authenticate.js';

const withMeta = (req) => ({ ipAddress: req.ip, userAgent: req.get('user-agent') });
const query = (req) => req._validatedQuery || req.query || {};

/** Bookings are open to every fleet reader; acting for others needs vehicles:write. */
async function bookingActor(req) {
  let canWrite = req.user.role?.name === 'Admin';
  if (!canWrite) {
    try { canWrite = satisfiesPermission(await loadUserPermissions(req.user), 'vehicles:write'); } catch { canWrite = false; }
  }
  return { _id: req.user._id, canWrite };
}

const handle = (fn, status = 200, message) => async (req, res, next) => {
  try {
    const data = await fn(req);
    return res.success({ data, ...(message ? { message } : {}), statusCode: status });
  } catch (err) { return next(err); }
};

class VehicleController {
  list = handle((req) => vehicleService.list(query(req)));
  stats = handle(() => vehicleService.stats());
  getById = handle((req) => vehicleService.getById(req.params.id));
  create = handle((req) => vehicleService.create(req.body, req.user._id, withMeta(req)), 201, 'Vehicle created');
  update = handle((req) => vehicleService.update(req.params.id, req.body, req.user._id, withMeta(req)), 200, 'Vehicle updated');
  remove = handle((req) => vehicleService.remove(req.params.id, req.user._id, withMeta(req)), 200, 'Vehicle deleted');
  assignDriver = handle((req) => vehicleService.assignDriver(req.params.id, req.body.driverId, req.user._id, withMeta(req)), 200, 'Driver updated');

  uploadPhoto = handle((req) => vehicleService.setPhoto(req.params.id, req.file, req.user._id, withMeta(req)), 200, 'Photo updated');
  removePhoto = handle((req) => vehicleService.removePhoto(req.params.id, req.user._id, withMeta(req)), 200, 'Photo removed');

  listServices = handle((req) => vehicleService.listServices(req.params.id));
  addService = handle((req) => vehicleService.addService(req.params.id, req.body, req.user._id, withMeta(req)), 201);
  deleteService = handle((req) => vehicleService.deleteService(req.params.id, req.params.subId, req.user._id, withMeta(req)), 200, 'Deleted');

  listCosts = handle((req) => vehicleService.listCosts(req.params.id, query(req)));
  addCost = handle((req) => vehicleService.addCost(req.params.id, req.body, req.user._id, withMeta(req)), 201);
  deleteCost = handle((req) => vehicleService.deleteCost(req.params.id, req.params.subId, req.user._id, withMeta(req)), 200, 'Deleted');

  listBookings = handle((req) => vehicleService.listBookings(req.params.id, query(req)));
  addBooking = handle(async (req) => vehicleService.addBooking(req.params.id, req.body, await bookingActor(req), withMeta(req)), 201);
  cancelBooking = handle(async (req) => vehicleService.cancelBooking(req.params.id, req.params.subId, await bookingActor(req), withMeta(req)), 200, 'Cancelled');

  listMaterials = handle((req) => vehicleService.listMaterials(req.params.id));
  addMaterial = handle((req) => vehicleService.addMaterial(req.params.id, req.body, req.user._id, withMeta(req)), 201);
  deleteMaterial = handle((req) => vehicleService.deleteMaterial(req.params.id, req.params.subId, req.user._id, withMeta(req)), 200, 'Deleted');

  listNotes = handle((req) => vehicleService.listNotes(req.params.id));
  addNote = handle((req) => vehicleService.addNote(req.params.id, req.body, req.user._id, withMeta(req)), 201);
  deleteNote = handle((req) => vehicleService.deleteNote(req.params.id, req.params.subId, req.user._id, withMeta(req)), 200, 'Deleted');

  listHistory = handle((req) => vehicleService.listHistory(req.params.id));

  async exportMaterialsPdf(req, res, next) {
    try {
      const vehicle = await vehicleService.getById(req.params.id);
      const materials = await vehicleService.listMaterials(req.params.id);

      const ciConfig = await ciService.getActiveConfig();
      const prepared = await ciRenderAssetsService.prepare(ciConfig);
      const { buffer } = await renderVehicleMaterialPdf({ vehicle, materials, ciConfig: prepared });

      const dateStr = new Date().toISOString().split('T')[0];
      const kennzeichen = (vehicle.kennzeichen || 'Fahrzeug').replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `Materialliste_${kennzeichen}_${dateStr}.pdf`;

      return res.attachment(fileName).type('application/pdf').send(buffer);
    } catch (err) { return next(err); }
  }
}

export default new VehicleController();
